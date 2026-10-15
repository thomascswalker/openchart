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
  [unknown],
  readonly MetadataValidationError[]
> {
  constructor() {
    super({});
  }

  async run(
    accessor: ServicesAccessor,
    metadata: unknown,
  ): Promise<readonly MetadataValidationError[]> {
    const document = accessor.get<DocumentService>("document");
    const result = metadataSchema.safeParse(metadata);
    if (result.success) {
      const mixer = accessor.get<MixerService>("mixer");
      const previousAudio = document.metadata.audio;

      for (const track of Object.keys(result.data.audio) as Array<
        keyof typeof result.data.audio
      >) {
        const nextPath = result.data.audio[track];
        if (previousAudio[track] === nextPath) {
          continue;
        }

        mixer.removeTrack(track);
        if (nextPath) {
          await mixer.addTrack(track);
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
