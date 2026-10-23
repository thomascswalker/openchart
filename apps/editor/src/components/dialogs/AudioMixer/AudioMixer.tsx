import { useSnapshot } from "../../../platform";
import {
  Button,
  H6,
  HorizontalSeparator,
  ResetIcon,
  Section,
  Slider,
  Text,
  type ButtonProps,
  type SliderProps,
} from "../../shared";
import type { Track as MixerTrack } from "@openchart/mixer";
import type { MixerSnapshot } from "../../../services/mixer/types";
import styles from "./TrackMixer.module.css";
import classNames from "classnames";
import type { ReactNode } from "react";
import { startCase } from "es-toolkit";

interface VolumeSliderProps extends Omit<
  SliderProps,
  "min" | "max" | "step" | "value" | "onChange"
> {
  value: number;
  onChange?: (value: number) => void;
}

const MIN_VOLUME_DB = -64;
const MAX_VOLUME_DB = 12;

const volumeToDb = (volume: number) =>
  volume > 0
    ? Math.max(MIN_VOLUME_DB, Math.min(MAX_VOLUME_DB, 20 * Math.log10(volume)))
    : MIN_VOLUME_DB;

const volumeToSliderValue = (volume: number) => {
  const volumeDb = volumeToDb(volume);

  return volumeDb <= 0
    ? ((volumeDb - MIN_VOLUME_DB) / -MIN_VOLUME_DB) * 0.5
    : 0.5 + (volumeDb / MAX_VOLUME_DB) * 0.5;
};

const sliderValueToVolume = (sliderValue: number) => {
  const volumeDb =
    sliderValue <= 0.5
      ? MIN_VOLUME_DB + (sliderValue / 0.5) * -MIN_VOLUME_DB
      : ((sliderValue - 0.5) / 0.5) * MAX_VOLUME_DB;

  return 10 ** (volumeDb / 20);
};

const formatVolumeDb = (volume: number) => {
  const volumeDb = volumeToDb(volume);
  return `${Number(volumeDb.toFixed(1))} dB`;
};

const setMasterVolume = (mixer: { masterVolume: number }, volume: number) => {
  mixer.masterVolume = volume;
};

const VolumeSlider = ({ value, onChange, ...props }: VolumeSliderProps) => {
  const sliderValue = volumeToSliderValue(value);

  return (
    <span className={styles["ui-track-mixer-volume-control"]}>
      <Slider
        {...props}
        className={styles["ui-track-mixer-volume-slider"]}
        min={0}
        max={1}
        step={0.001}
        value={sliderValue}
        aria-valuetext={formatVolumeDb(value)}
        onChange={(event) =>
          onChange?.(sliderValueToVolume(Number(event.target.value)))
        }
      />
      <span
        className={styles["ui-track-mixer-volume-tooltip"]}
        style={{ left: `${sliderValue * 100}%` }}
      >
        {formatVolumeDb(value)}
      </span>
    </span>
  );
};

interface TrackButtonProps extends Omit<ButtonProps, "type"> {
  type: "solo" | "mute" | "reset";
  checked?: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  children?: ReactNode;
}

const TrackButton = ({
  type,
  icon,
  checked,
  onClick,
  disabled = false,
  ariaLabel,
  children,
}: TrackButtonProps) => {
  return (
    <Button
      icon={icon}
      width={24}
      height={24}
      minWidth={24}
      minHeight={24}
      maxWidth={24}
      maxHeight={24}
      checked={checked}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      flat
      className={classNames(
        styles["ui-track-mixer-button"],
        styles[`ui-track-mixer-${type}-button`],
      )}
    >
      {children}
    </Button>
  );
};

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

const AudioTrack = ({
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
        <TrackButton
          type="reset"
          icon={<ResetIcon />}
          ariaLabel="Reset track volume"
          disabled={masterMuted}
          onClick={() => onVolumeChange?.(track, 1)}
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
  );
};

const AudioMixer = () => {
  const mixer = useSnapshot<MixerSnapshot>("mixer").mixer;
  const hasSoloedTrack = Object.values(mixer.tracks).some(
    (track) => track.soloed,
  );

  const handleMuteClick = (track: MixerTrack) => {
    mixer.toggleMute(track);
  };

  const handleSoloClick = (track: MixerTrack) => {
    mixer.toggleSolo(track);
  };

  const handleVolumeChange = (track: MixerTrack, volume: number) => {
    mixer.setTrackVolume(track, volume);
  };

  return (
    <Section padding={0} gap="0" className={styles["ui-track-mixer"]}>
      <Section
        flexDirection="row"
        minHeight="64px"
        padding={0}
        backgroundColor="var(--neutral-85)"
        className={styles["ui-track-mixer-master-row"]}
      >
        <Section
          paddingLeft="16px"
          paddingRight="16px"
          alignItems="center"
          flexDirection="row"
          className={styles["ui-track-mixer-master-controls"]}
        >
          <Text textAlign="left">MASTER</Text>
          <VolumeSlider
            onChange={(volume) => setMasterVolume(mixer, volume)}
            value={mixer.masterVolume}
          />
          <TrackButton
            type="reset"
            icon={<ResetIcon />}
            ariaLabel="Reset master volume"
            onClick={() => setMasterVolume(mixer, 1)}
          />
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
        width={`calc(100%)`}
        maxWidth="100vw"
        margin={0}
        padding={0}
      />
      <Section
        paddingX="8px"
        paddingY="none"
        gap="0"
        className={styles["ui-track-mixer-track-list"]}
      >
        {Object.keys(mixer.tracks).length === 0 && (
          <Text textAlign="center">No audio tracks loaded</Text>
        )}
        {Object.entries(mixer.tracks).map(([name, track], index) => (
          <AudioTrack
            key={name}
            name={name}
            track={track}
            index={index}
            hasSoloedTrack={hasSoloedTrack}
            masterMuted={mixer.masterMuted}
            onMuteClick={handleMuteClick}
            onSoloClick={handleSoloClick}
            onVolumeChange={handleVolumeChange}
          />
        ))}
      </Section>
    </Section>
  );
};

export { AudioMixer };
