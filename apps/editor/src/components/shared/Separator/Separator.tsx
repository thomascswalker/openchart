import { alignSelf } from "styled-system";
import type { Orientation } from "../props";

const DEFAULT_THICKNESS = 2;
const DEFAULT_MARGIN = 4;

interface SeparatorProps {
  orientation?: Orientation;
  thickness?: number;
}

const Separator = ({
  orientation = "horizontal",
  thickness = DEFAULT_THICKNESS,
}: SeparatorProps) => {
  const isVertical = orientation === "vertical";
  const width = isVertical ? `${thickness}px` : "90%";
  const height = isVertical ? "90%" : `${thickness}px`;

  const separatorStyle = {
    backgroundColor: "var(--neutral-60)",
    width,
    height,
    maxWidth: width,
    maxHeight: height,
    marginLeft: `${DEFAULT_MARGIN}px`,
    marginRight: `${DEFAULT_MARGIN}px`,
    alignSelf: "center",
  };

  return <div style={separatorStyle} role="separator" />;
};
export const VerticalSeparator = ({
  thickness = DEFAULT_THICKNESS,
}: Omit<SeparatorProps, "orientation">) => {
  return <Separator orientation="vertical" thickness={thickness} />;
};
export const HorizontalSeparator = ({
  thickness = DEFAULT_THICKNESS,
}: Omit<SeparatorProps, "orientation">) => {
  return <Separator orientation="horizontal" thickness={thickness} />;
};
