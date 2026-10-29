import { H6, ResetIcon, Section, Text } from "../../shared";
import type { MixerTrack } from "@openchart/audio";
import styles from "./AudioMixer.module.css";
import { startCase } from "es-toolkit";
import { VolumeSlider } from "./VolumeSlider";
import { AudioTrackButton } from "./AudioTrackButton";

interface AudioTrackProps {
  name?: string;
  track: MixerTrack;
  index: number;
  hasSoloedTrack: boolean;
  masterMuted: boolean;
  onVolumeChange?: (track: MixerTrack, value: number) => void;
  onMuteClick?: (track: MixerTrack) => void;
  onSoloClick?: (track: MixerTrack) => void;
}

export const AudioTrack = ({
  name,
  track,
  index,
  hasSoloedTrack,
  masterMuted,
  onVolumeChange,
  onMuteClick,
  onSoloClick,
}: AudioTrackProps) => {
  const enabled =
    !masterMuted && (track.soloed || (!hasSoloedTrack && !track.muted));

  return (
    <Section
      flexDirection="row"
      minHeight="64px"
      padding={0}
      className={styles["ui-track-mixer-track"]}
    >
      <Section
        maxWidth="var(--size-med)"
        padding={0}
        flexDirection="row"
        alignItems="center"
        className={styles["ui-track-mixer-track-index"]}
      >
        <H6 textAlign="center" disabled={!enabled}>
          {index}
        </H6>
      </Section>
      <Section
        padding={0}
        paddingLeft={"8px"}
        alignItems="center"
        flexDirection="row"
        className={styles["ui-track-mixer-track-controls"]}
      >
        <Text
          className={styles["ui-track-mixer-track-name"]}
          textAlign="left"
          disabled={!enabled}
        >
          {startCase(name || "")}
        </Text>
        <VolumeSlider
          onChange={(volume) => onVolumeChange?.(track, volume)}
          value={track.volume}
          disabled={!enabled}
        />
        <AudioTrackButton
          type="reset"
          icon={<ResetIcon />}
          ariaLabel="Reset track volume"
          disabled={masterMuted}
          onClick={() => onVolumeChange?.(track, 1)}
        />
        <AudioTrackButton
          type="solo"
          checked={track.soloed}
          disabled={masterMuted}
          onClick={() => onSoloClick?.(track)}
        >
          S
        </AudioTrackButton>
        <AudioTrackButton
          type="mute"
          checked={track.muted}
          disabled={masterMuted}
          onClick={() => onMuteClick?.(track)}
        >
          M
        </AudioTrackButton>
      </Section>
    </Section>
  );
};
