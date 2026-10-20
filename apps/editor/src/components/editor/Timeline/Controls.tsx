import { runAction } from "../../../actions/execute";
import Box from "../../shared/Box";
import { Button } from "../../shared/Button";
import { Text } from "../../shared/Text";
import styles from "./Timeline.module.css";
import type { TimelinePosition } from "./util";
import { layout, compose, type LayoutProps } from "styled-system";
import { vars } from "../../../util/css";

const Rewind = "◀|";
const Play = "▶";
const Pause = "⏸";
const FastForward = "|▶";
const ClockItemWidth = "80px";

const clockItemStyles = compose(layout);

interface ClockItemProps extends LayoutProps {
  label: string;
  value: string | number;
}

const ClockItem = ({ label, value, ...props }: ClockItemProps) => {
  const clockItem = clockItemStyles(props);

  return (
    <span className={styles["clock-item"]} style={clockItem}>
      <Text
        className={styles["clock-label"]}
        textAlign="center"
        fontSize="10px"
        mono
      >
        {label}
      </Text>
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
  return (
    <div className={styles["controls"]}>
      <div className={styles["clock"]}>
        <ClockItem label="TICK" value={position.tick} width={ClockItemWidth} />
        <ClockItem label="TIME" value={position.time} width={ClockItemWidth} />
        <ClockItem
          label="MEAS"
          value={position.measure}
          width={ClockItemWidth}
        />
      </div>
      <Button
        onClick={() => runAction("playback.seek-start")}
        disabled={isPlaying}
      >
        {Rewind}
      </Button>
      <Button onClick={() => runAction("playback.toggle")}>
        {isPlaying ? Pause : Play}
      </Button>
      <Button
        onClick={() => runAction("playback.seek-end")}
        disabled={isPlaying}
      >
        {FastForward}
      </Button>
    </div>
  );
};

export default Controls;
