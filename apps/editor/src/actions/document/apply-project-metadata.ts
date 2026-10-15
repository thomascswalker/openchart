import { Action } from "../../platform/actions";
import type { ServicesAccessor } from "../../platform/services";
import { EditorStateService } from "../../services/editor/state";
import { DocumentService } from "../../services/document";
import { MixerService } from "../../services/mixer";
import {
  metadataSchema,
  type MetadataValidationError,
} from "../../services/document/schema";

export class ApplyProjectMetadataAction extends Action<
  [unknown, boolean?],
  readonly MetadataValidationError[]
> {
  constructor() {
    super({});
  }

  async run(
    accessor: ServicesAccessor,
    metadata: unknown,
    forceReload = false,
  ): Promise<readonly MetadataValidationError[]> {
    const document = accessor.get<DocumentService>("document");
    const result = metadataSchema.safeParse(metadata);
    if (result.success) {
      const mixer = accessor.get<MixerService>("mixer");
      const projectRoot = document.snapshot.directoryHandle;
      const tracks = (
        Object.keys(result.data.audio) as Array<keyof typeof result.data.audio>
      ).filter(
        (track): track is Exclude<keyof typeof result.data.audio, "root"> =>
          track !== "root",
      );
      const files = tracks
        .map((track) => [track, result.data.audio[track]] as const)
        .filter(
          (entry): entry is readonly [(typeof tracks)[number], string] =>
            entry[1] !== null,
        );
      const pathErrors: MetadataValidationError[] = [];

      if (files.length > 0 && !projectRoot) {
        pathErrors.push({
          path: "$.audio",
          message: "Save the project to a folder before loading audio files.",
        });
      }
      if (result.data.audio.root === null) {
        for (const [track, path] of files) {
          if (path.includes("/") || path.includes("\\")) {
            pathErrors.push({
              path: `$.audio.${track}`,
              message:
                "Without an audio root folder, audio files must be beside notes.mid and info.json.",
            });
          }
        }
      }

      if (pathErrors.length > 0) {
        accessor
          .get<EditorStateService>("editor.state")
          .setError(
            pathErrors
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join("\n"),
          );
        return pathErrors;
      }

      const previousAudio = document.metadata.audio;
      const rootChanged = previousAudio.root !== result.data.audio.root;

      for (const track of tracks) {
        const nextPath = result.data.audio[track];
        if (
          previousAudio[track] === nextPath &&
          (!rootChanged || !nextPath) &&
          !forceReload
        ) {
          continue;
        }

        mixer.removeTrack(track);
        if (nextPath) {
          await mixer.addTrack(
            track,
            nextPath,
            projectRoot,
            result.data.audio.root,
          );
        }
      }

      document.metadata = result.data;
      accessor.get<EditorStateService>("editor.state").clearError();
      return [];
    }

    const issues = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? `$.${issue.path.join(".")}` : "$",
      message: issue.message,
    }));
    accessor
      .get<EditorStateService>("editor.state")
      .setError(
        issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
      );
    return issues;
  }
}
