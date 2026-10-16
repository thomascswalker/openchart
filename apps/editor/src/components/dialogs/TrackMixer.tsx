import { useSyncExternalStore } from "react";
import { useService } from "../../platform";
import { MixerService } from "../../services/mixer";
import { Section } from "../shared/Section";
import { H2, Text } from "../shared/Text";
import Mixer from "@openchart/mixer";
import { HorizontalSeparator } from "../shared/Separator";

interface TrackProps {
  name?: string;
  track: Mixer.Track;
  index: number;
}

const Track = ({ name, track, index }: TrackProps) => {
  return (
    <Section>
      Track {index} ({name || track.filename})
    </Section>
  );
};

const TrackMixer = () => {
  const mixer = useService<MixerService>("mixer");
  const snapshot = useSyncExternalStore(
    mixer.subscribe,
    mixer.getSnapshot,
    mixer.getSnapshot,
  );

  const padding = "8px"; // --space-med
  return (
    <Section padding={padding} border="var(--border-primary)">
      <H2>Track Mixer</H2>
      <HorizontalSeparator
        thickness={1}
        width={`calc(100% + (2 * ${padding}))`}
        maxWidth="100vw"
      />
      {Object.entries(snapshot.mixer.tracks).map(([name, track], index) => (
        <div key={name}>
          <Track name={name} track={track} index={index} />
        </div>
      ))}
    </Section>
  );
};

export default TrackMixer;
