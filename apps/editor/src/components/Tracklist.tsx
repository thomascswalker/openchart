import { SongView } from "@openchart/views";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { runActionAsync } from "../actions/execute";
import Box from "./shared/Box";

/** Config-driven track projection used by piano-roll panels. */
export function TrackList() {
  const { midi: midiData } = useDocumentSnapshot();
  const { viewportSessions, activeViewportId } = useViewportSnapshot();
  const session = viewportSessions.find((item) => item.id === activeViewportId);
  const songView = midiData ? new SongView(midiData) : null;
  const allDescriptors = songView?.getTrackDescriptors() ?? [];
  const descriptors = allDescriptors.filter(
    (item) => item.visible && item.name !== "CHART HEADER",
  );
  const configuredNames = new Set(allDescriptors.map((item) => item.name));
  const unmapped =
    midiData?.tracks.filter((track) => !configuredNames.has(track.name)) ?? [];

  if (!session) {
    return null;
  }

  return (
    <Box display="flex" flexDirection="column">
      {descriptors.map((descriptor, index) => {
        const selected = session.trackKey === descriptor.key;
        return (
          <button
            type="button"
            key={descriptor.key}
            className={selected ? "track-row track-row--selected" : "track-row"}
            onClick={() => {
              void runActionAsync("editor.focus-viewport", activeViewportId)
                .then(() =>
                  runActionAsync("editor.update-viewport", activeViewportId, {
                    trackKey: descriptor.key,
                    instrument: descriptor.name,
                  }),
                )
                .catch(() => {});
            }}
            aria-pressed={selected}
          >
            <span className="track-row__header">
              <span className="track-row__number">{index + 1}</span>
              <span className="track-row__name">{descriptor.name}</span>
            </span>
          </button>
        );
      })}
      {unmapped.map((track, index) => (
        <button
          type="button"
          key={`unmapped-${index}`}
          className="track-row"
          onClick={() => {
            void runActionAsync("editor.focus-viewport", activeViewportId)
              .then(() =>
                runActionAsync("editor.update-viewport", activeViewportId, {
                  trackKey: `unmapped-${index}`,
                  instrument: track.name,
                }),
              )
              .catch(() => {});
          }}
          aria-label={`Unmapped track ${track.name || index + 1}`}
        >
          <span className="track-row__header">
            <span className="track-row__number">?</span>
            <span className="track-row__name">
              {track.name || `Track ${index + 1}`} (Other)
            </span>
          </span>
        </button>
      ))}
      {!descriptors.length && !unmapped.length ? (
        <div className="track-list--empty">No MIDI file loaded.</div>
      ) : null}
    </Box>
  );
}
