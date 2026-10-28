import { useDocument } from "../../../hooks/useDocument";
import { useRuleset } from "../../../hooks/useRuleset";
import { runActionAsync } from "../../../actions/execute";
import type { ViewportSession } from "../../../services/editor/viewports";
import { Box, Button, Text } from "../../shared";
import styles from "./TrackList.module.css";
import type { MidiTrack } from "@openchart/midi";

interface TrackListProps {
  session?: ViewportSession;
}

export function TrackList({ session }: TrackListProps) {
  const { midi } = useDocument();
  const { compiled } = useRuleset();
  if (!midi) {
    return <Text>No MIDI data</Text>;
  }

  // Only tracks the active ruleset describes (and shows) are listed.
  const getTrackKey = (track: MidiTrack) => {
    const rules = compiled.byName.get(track.name);
    return rules?.visible ? rules.key : undefined;
  };

  return (
    <Box
      className={styles.trackList}
      display="flex"
      flexDirection="column"
      alignItems="start"
      minHeight={0}
      padding={0}
    >
      {midi.tracks.map((track, index) => {
        const key = getTrackKey(track);
        if (!key) {
          return null;
        }
        const selected = session?.trackKey === key;
        return (
          <Button
            key={key}
            className={styles.trackRow}
            checked={selected}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              if (session) {
                void runActionAsync("editor.focus-viewport", session.id)
                  .then(() =>
                    runActionAsync("editor.update-viewport", session.id, {
                      trackKey: key,
                      instrument: track.name,
                    }),
                  )
                  .catch(() => {});
              }
            }}
          >
            <Text className={styles.trackNumber}>{index + 1}</Text>
            <Text className={styles.trackName}>{track.name}</Text>
          </Button>
        );
      })}
    </Box>
  );
}
