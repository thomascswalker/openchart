import { SongView } from "@openchart/views";
import { useDocumentSnapshot } from "../hooks/useDocumentSnapshot";
import { useViewportSnapshot } from "../hooks/useViewportSnapshot";
import { runActionAsync } from "../actions/execute";
import Box from "./shared/Box";
import { Button } from "./shared/Button";
import { Text } from "./shared/Text";
import styles from "./TrackList.module.css";

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
    <Box
      className={styles.trackList}
      display="flex"
      flexDirection="column"
      alignItems="start"
      minHeight={0}
      padding={0}
    >
      {descriptors.map((descriptor, index) => {
        const selected = session.trackKey === descriptor.key;
        return (
          <Button
            key={descriptor.key}
            className={styles.trackRow}
            checked={selected}
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
          >
            <Text className={styles.trackNumber}>{index + 1}</Text>
            <Text className={styles.trackName}>{descriptor.name}</Text>
          </Button>
        );
      })}
      {unmapped.map((track, index) => (
        <Button
          key={`unmapped-${index}`}
          className={styles.trackRow}
          checked={session.trackKey === `unmapped-${index}`}
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
          <Text className={styles.trackNumber}>?</Text>
          <Text className={styles.trackName}>
            {track.name || `Track ${index + 1}`} (Other)
          </Text>
        </Button>
      ))}
      {!descriptors.length && !unmapped.length ? (
        <Text className={styles.emptyState}>No MIDI file loaded.</Text>
      ) : null}
    </Box>
  );
}
