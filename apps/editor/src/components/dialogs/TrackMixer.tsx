import { useSnapshot } from "../../platform";
import { Section } from "../shared/Section";
import { Text, H2, H6 } from "../shared/Text";
import Mixer from "@openchart/mixer";
import { HorizontalSeparator } from "../shared/Separator";
import type { MixerSnapshot } from "../../services/mixer/types";
import { Button } from "../shared/Button";
import { Slider } from "../shared/Slider";
import styles from "./TrackMixer.module.css";
import classNames from "classnames";

interface TrackProps {
  name?: string;
  track: Mixer.Track;
  index: number;
  hasSoloedTrack: boolean;
  onVolumeChange?: (track: Mixer.Track, value: number) => void;
  onMuteClick?: (track: Mixer.Track) => void;
  onSoloClick?: (track: Mixer.Track) => void;
}

const Track = ({
  name,
  track,
  index,
  hasSoloedTrack,
  onVolumeChange,
  onMuteClick,
  onSoloClick,
}: TrackProps) => {
  const enabled = track.soloed || (!hasSoloedTrack && !track.muted);
  const backgroundColor = enabled ? "var(--neutral-85)" : "var(--neutral-80)";

  return (
    <Section flexDirection="row" minHeight="64px" padding={0}>
      <Section
        maxWidth="var(--size-med)"
        padding={0}
        backgroundColor={backgroundColor}
        flexDirection="row"
        alignItems="center"
      >
        <H6 textAlign="center" verticalAlign="middle" disabled={!enabled}>
          {index}
        </H6>
      </Section>
      <Section
        padding={0}
        paddingLeft={"8px"}
        alignItems="center"
        flexDirection="row"
        backgroundColor={backgroundColor}
      >
        <Text textAlign="left" verticalAlign="middle" disabled={!enabled}>
          {name}
        </Text>
        <Section minWidth="200px" flexDirection="row">
          <Slider
            onChange={(e) => onVolumeChange?.(track, Number(e.target.value))}
            value={track.volume}
            min={0}
            max={1}
            disabled={!enabled}
          />
          <Button
            width={24}
            height={24}
            maxWidth={24}
            maxHeight={24}
            checked={track.soloed}
            onClick={() => onSoloClick?.(track)}
            className={classNames(
              styles["ui-track-mixer-button"],
              styles["ui-track-mixer-solo-button"],
            )}
          >
            S
          </Button>
          <Button
            width={24}
            height={24}
            maxWidth={24}
            maxHeight={24}
            checked={track.muted}
            onClick={() => onMuteClick?.(track)}
            className={classNames(
              styles["ui-track-mixer-button"],
              styles["ui-track-mixer-mute-button"],
            )}
          >
            M
          </Button>
        </Section>
      </Section>
    </Section>
  );
};

const TrackMixer = () => {
  const mixer = useSnapshot<MixerSnapshot>("mixer").mixer;
  const trackCount = Object.values(mixer.tracks).length;
  const hasSoloedTrack = Object.values(mixer.tracks).some(
    (track) => track.soloed,
  );
  const padding = "8px"; // --space-med

  const handleMuteClick = (track: Mixer.Track) => {
    mixer.toggleMute(track);
  };
  const handleSoloClick = (track: Mixer.Track) => {
    mixer.toggleSolo(track);
  };
  const handleVolumeChange = (track: Mixer.Track, volume: number) => {};

  return (
    <Section padding={padding}>
      <H2>Track Mixer</H2>
      <Text>{trackCount} tracks</Text>
      <HorizontalSeparator
        thickness={1}
        width={`calc(100% + (2 * ${padding}))`}
        maxWidth="100vw"
      />
      {Object.entries(mixer.tracks).map(([name, track], index) => (
        <div key={name}>
          <Track
            name={name}
            track={track}
            index={index}
            hasSoloedTrack={hasSoloedTrack}
            onMuteClick={handleMuteClick}
            onSoloClick={handleSoloClick}
          />
        </div>
      ))}
    </Section>
  );
};

export default TrackMixer;
