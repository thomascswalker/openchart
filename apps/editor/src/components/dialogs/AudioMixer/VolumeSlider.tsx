import { type SliderProps, Slider } from "../../shared";
import styles from "./AudioMixer.module.css";

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

export const VolumeSlider = ({
  value,
  onChange,
  ...props
}: VolumeSliderProps) => {
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
