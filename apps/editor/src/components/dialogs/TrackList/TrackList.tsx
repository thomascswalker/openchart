import { SongView } from "@openchart/views";
import { useDocument } from "../../../hooks/useDocument";
import { runActionAsync } from "../../../actions/execute";
import type { ViewportSession } from "../../../services/editor/viewports";
import { Box, Button, Text } from "../../shared";
import styles from "./TrackList.module.css";
import { useMemo } from "react";
import type { MidiTrack } from "@openchart/midi";

interface TrackListProps {
  session?: ViewportSession;
}

export function TrackList({ session }: TrackListProps) {
  const { midi } = useDocument();
  const view = useMemo(() => (midi ? new SongView(midi) : null), [midi]);
  if (!midi || !view) {
    return <Text>No MIDI data</Text>;
  }

  const getTrackKey = (track: MidiTrack) => {
    const desc = view.getTrackDescriptors();
    return desc.find((d) => d.name === track.name)?.key;
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
