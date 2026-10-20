import { runAction } from "../../../actions/execute";
import Box from "../../shared/Box";
import { Button } from "../../shared/Button";
import { Text } from "../../shared/Text";
import styles from "./Timeline.module.css";
import type { TimelinePosition } from "./util";
import { layout, compose, type LayoutProps, type styleFn } from "styled-system";
import { vars } from "../../../util/css";

const Rewind = "◀|";
const Play = "▶";
const Pause = "⏸";
const FastForward = "|▶";
const ClockItemWidth = "70px";
const ActionButtonWidth = "40px";

const clockItemStyles: styleFn = compose(layout);

interface ClockItemProps extends LayoutProps {
  label: string;
  value: string | number;
}

const ClockItem = ({ label, value, ...props }: ClockItemProps) => {
  const clockItem = clockItemStyles(props);

  return (
    <span className={styles["clock-item"]} style={clockItem}>
      <Box padding={0} backgroundColor={vars("transparent")}>
        <Text
          className={styles["clock-label"]}
          alignContent="flex-start"
          justifyContent="center"
          fontSize="10px"
          mono
        >
          {label}
        </Text>
      </Box>
      <Box padding={0} backgroundColor={vars("black")}>
        <Text fontSize="10px" mono>
          {value}
        </Text>
      </Box>
    </span>
  );
};

interface ControlsProps {
  position: TimelinePosition;
  isPlaying: boolean;
}

const Controls = ({ position, isPlaying }: ControlsProps) => {
  const buttons = [
    {
      action: "playback.seek-start",
      width: ActionButtonWidth,
      label: Rewind,
      ariaLabel: "Jump to Beginning",
      disabled: isPlaying,
    },
    {
      action: "playback.toggle",
      width: ActionButtonWidth,
      label: isPlaying ? Pause : Play,
      ariaLabel: "Play/Pause",
      disabled: false,
    },
    {
      action: "playback.seek-end",
      width: ActionButtonWidth,
      label: FastForward,
      ariaLabel: "Jump to End",
      disabled: isPlaying,
    },
  ];
  return (
    <div className={styles["controls"]}>
      <output
        className={styles["clock"]}
        aria-label={`Playback position: tick ${position.tick}, time ${position.time}, measure ${position.measure}`}
      >
        <ClockItem label="TICK" value={position.tick} width={ClockItemWidth} />
        <ClockItem label="TIME" value={position.time} width={ClockItemWidth} />
        <ClockItem
          label="MEAS"
          value={position.measure}
          width={ClockItemWidth}
        />
      </output>
      {buttons.map(({ action, width, label, ariaLabel, disabled }) => (
        <Button
          key={action}
          onClick={() => runAction(action)}
          disabled={disabled}
          width={width}
          aria-label={ariaLabel}
        >
          {label}
        </Button>
      ))}
    </div>
  );
};

export default Controls;
