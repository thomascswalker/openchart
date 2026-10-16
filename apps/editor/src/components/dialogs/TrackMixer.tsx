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
import type { ReactNode } from "react";

interface TrackButtonProps {
  type: "solo" | "mute";
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

const TrackButton = ({
  type,
  checked,
  onClick,
  disabled = false,
  children,
}: TrackButtonProps) => {
  return (
    <Button
      width={24}
      height={24}
      maxWidth={24}
      maxHeight={24}
      checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        styles["ui-track-mixer-button"],
        styles[`ui-track-mixer-${type}-button`],
      )}
    >
      {children}
    </Button>
  );
};

interface TrackProps {
  name?: string;
  track: Mixer.Track;
  index: number;
  hasSoloedTrack: boolean;
  masterMuted: boolean;
  onVolumeChange?: (track: Mixer.Track, value: number) => void;
  onMuteClick?: (track: Mixer.Track) => void;
  onSoloClick?: (track: Mixer.Track) => void;
}

const Track = ({
  name,
  track,
  index,
  hasSoloedTrack,
  masterMuted,
  onVolumeChange,
  onMuteClick,
  onSoloClick,
}: TrackProps) => {
  const enabled =
    !masterMuted && (track.soloed || (!hasSoloedTrack && !track.muted));
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
          <TrackButton
            type="solo"
            checked={track.soloed}
            disabled={masterMuted}
            onClick={() => onSoloClick?.(track)}
          >
            S
          </TrackButton>
          <TrackButton
            type="mute"
            checked={track.muted}
            disabled={masterMuted}
            onClick={() => onMuteClick?.(track)}
          >
            M
          </TrackButton>
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

  const handleVolumeChange = (track: Mixer.Track, volume: number) => {
    mixer.setTrackVolume(track, volume);
  };

  return (
    <Section padding={padding}>
      <Section
        flexDirection="row"
        minHeight="64px"
        padding={0}
        backgroundColor="var(--neutral-85)"
      >
        <Section
          padding={0}
          paddingLeft="16px"
          paddingRight="8px"
          alignItems="center"
          flexDirection="row"
        >
          <Text textAlign="left" verticalAlign="middle">
            MASTER
          </Text>
          <Section minWidth="200px" flexDirection="row">
            <Slider
              onChange={(event) =>
                (mixer.masterVolume = Number(event.target.value))
              }
              value={mixer.masterVolume}
              min={0}
              max={1}
            />
          </Section>
          <TrackButton
            type="mute"
            checked={mixer.masterMuted}
            onClick={() => mixer.toggleMasterMute()}
          >
            M
          </TrackButton>
        </Section>
      </Section>
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
            masterMuted={mixer.masterMuted}
            onMuteClick={handleMuteClick}
            onSoloClick={handleSoloClick}
            onVolumeChange={handleVolumeChange}
          />
        </div>
      ))}
    </Section>
  );
};

export default TrackMixer;
