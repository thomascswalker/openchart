import { SongView } from "@midiedit/views";
import { useEditor } from "../context/EditorContext";
import "./styles.css";

interface TrackListProps {
  viewportId: string;
}

/** Config-driven track projection used by piano-roll panels. */
export function TrackList({ viewportId }: TrackListProps) {
  const { midiData, viewportSessions, updateViewport, focusViewport } = useEditor();
  const session = viewportSessions.find((item) => item.id === viewportId);
  const songView = midiData ? new SongView(midiData) : null;
  const allDescriptors = songView?.getTrackDescriptors() ?? [];
  const descriptors = allDescriptors.filter((item) => item.visible && item.name !== "CHART HEADER");
  const configuredNames = new Set(allDescriptors.map((item) => item.name));
  const unmapped = midiData?.tracks.filter((track) => !configuredNames.has(track.name)) ?? [];

  if (!session) return null;

  return (
    <aside className="arrangement piano-roll-track-list" aria-label="Configured tracks">
      <div className="arrangement__header">
        <strong>Tracks</strong>
        <span className="arrangement__metadata">{descriptors.length + unmapped.length}</span>
      </div>
      <div className="track-list">
        {descriptors.map((descriptor, index) => {
          const selected = session.trackKey === descriptor.key;
          return (
            <button
              type="button"
              key={descriptor.key}
              className={selected ? "track-row track-row--selected" : "track-row"}
              onClick={() => {
                focusViewport(viewportId);
                updateViewport(viewportId, { trackKey: descriptor.key, instrument: descriptor.name });
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
              focusViewport(viewportId);
              updateViewport(viewportId, { trackKey: `unmapped-${index}`, instrument: track.name });
            }}
            aria-label={`Unmapped track ${track.name || index + 1}`}
          >
            <span className="track-row__header">
              <span className="track-row__number">?</span>
              <span className="track-row__name">{track.name || `Track ${index + 1}`} (Other)</span>
            </span>
          </button>
        ))}
        {!descriptors.length && !unmapped.length ? <div className="track-list--empty">No MIDI file loaded.</div> : null}
      </div>
    </aside>
  );
}
