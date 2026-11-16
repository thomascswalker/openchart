import { Action } from '../../actions';
import { EditorStateService } from '../../services/editor/state';
import { MixerService } from '../../services/mixer/mixer';
import { ProjectService } from '../../services/project/project';
import { type MetadataValidationError } from '../../services/project/schema';
import type { ServicesAccessor } from '../../services/registry';

type TArgs = [unknown, boolean?];
type TResult = readonly MetadataValidationError[];

export class ApplyProjectMetadataAction extends Action<TArgs, TResult> {
  async run(
    accessor: ServicesAccessor,
    metadata: unknown,
    forceReload = false,
  ) {
    const project = accessor.get<ProjectService>('project');
    const mixer = accessor.get<MixerService>('mixer');
    const editorState = accessor.get<EditorStateService>('editor.state');

    // Validate the provided metadata against the project's schema.
    const result = project.metadataSchema.safeParse(metadata);

    // If the metadata is invalid, collect and report the validation errors.
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? `$.${issue.path.join('.')}` : '$',
        message: issue.message,
      }));
      editorState.setError(
        issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
      );
      return issues;
    }

    // Extract the list of audio tracks and their corresponding file paths from
    // the metadata (excluding the root directory).
    const tracks = (
      Object.keys(result.data.audio) as Array<keyof typeof result.data.audio>
    ).filter(
      (track): track is Exclude<keyof typeof result.data.audio, 'root'> =>
        track !== 'root',
    );

    // Extract the list of audio tracks that have valid file paths.
    const files = tracks
      .map((track) => [track, result.data.audio[track]] as const)
      .filter(
        (entry): entry is readonly [(typeof tracks)[number], string] =>
          entry[1] !== null,
      );

    // Initialize an array to collect any path-related validation errors.
    const pathErrors: MetadataValidationError[] = [];

    const projectRoot = project.getSnapshot().directoryHandle;

    // If there are audio files but no project root, add a validation error.
    if (files.length > 0 && !projectRoot) {
      pathErrors.push({
        path: '$.audio',
        message: 'Save the project to a folder before loading audio files.',
      });
    }

    // If there is no audio root directory, ensure that all audio files are in
    // the project root.
    if (result.data.audio.root === null) {
      for (const [track, path] of files) {
        if (path.includes('/') || path.includes('\\')) {
          pathErrors.push({
            path: `$.audio.${track}`,
            message:
              'Without an audio root folder, audio files must be beside notes.mid and info.json.',
          });
        }
      }
    }

    // If there are any path-related validation errors, report them and stop
    // further processing.
    if (pathErrors.length > 0) {
      const formattedErrors = pathErrors
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('\n');
      editorState.setError(formattedErrors);
      return pathErrors;
    }

    const previousAudio = project.metadata.audio;
    const rootDirectoryChanged = previousAudio.root !== result.data.audio.root;

    // Update the audio tracks in the mixer based on the new metadata.
    tracks.forEach(async (track) => {
      const nextPath = result.data.audio[track];
      const previousPath = previousAudio[track];

      // Skip updating the track if the path hasn't changed and no reload is
      // forced.
      if (
        previousPath === nextPath &&
        (!rootDirectoryChanged || !nextPath) &&
        !forceReload
      ) {
        return;
      }

      // Remove the track from the mixer before potentially adding it again.
      mixer.removeTrack(track);

      // If there is a new path for the track, add it to the mixer.
      if (nextPath) {
        await mixer.addTrack(
          track,
          nextPath,
          projectRoot,
          result.data.audio.root,
        );
      }
    });

    // Update the project's metadata with the new data.
    project.metadata = result.data;

    // Clear any existing error messages in the editor state.
    editorState.clearError();

    // Return an empty array to indicate no path-related validation errors
    // occurred.
    return [];
  }
}
