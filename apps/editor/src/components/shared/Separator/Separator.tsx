import type { CSSProperties, HTMLAttributes } from "react";
import {
  color,
  compose,
  flex,
  space,
  size,
  layout,
  type ColorProps,
  type FlexProps,
  type SpaceProps,
  type SizeProps,
  type LayoutProps,
  type styleFn,
} from "styled-system";

const DEFAULT_THICKNESS = 2;

export type Orientation = "horizontal" | "vertical";

const getSystemStyles: styleFn = compose(space, color, flex, size, layout);
const systemPropNames = new Set(getSystemStyles.propNames ?? []);

type SystemProps = ColorProps &
  FlexProps &
  SpaceProps &
  SizeProps &
  LayoutProps;

export interface SeparatorProps
  extends
    Omit<HTMLAttributes<HTMLDivElement>, keyof SystemProps | "role">,
    SystemProps {
  orientation?: Orientation;
  thickness?: number;
}

const Separator = ({
  orientation = "horizontal",
  thickness = DEFAULT_THICKNESS,
  className,
  style: customStyle,
  ...props
}: SeparatorProps) => {
  const isVertical = orientation === "vertical";
  const width = isVertical ? `${thickness}px` : "100%";
  const height = isVertical ? "100%" : `${thickness}px`;

  const systemStyles = getSystemStyles(props);
  const htmlProps = Object.fromEntries(
    Object.entries(props).filter(
      ([propName]) => !systemPropNames.has(propName),
    ),
  );

  const separatorStyle: CSSProperties = {
    backgroundColor: "var(--border-color-primary)",
    width,
    height,
    minWidth: width,
    minHeight: height,
    maxWidth: width,
    maxHeight: height,
    alignSelf: "center",
    ...systemStyles,
    ...customStyle,
  };

  return (
    <div
      {...htmlProps}
      className={className}
      style={separatorStyle}
      role="separator"
    />
  );
};

export const VerticalSeparator = ({
  thickness = DEFAULT_THICKNESS,
  ...props
}: Omit<SeparatorProps, "orientation">) => {
  return <Separator orientation="vertical" thickness={thickness} {...props} />;
};

export const HorizontalSeparator = ({
  thickness = DEFAULT_THICKNESS,
  ...props
}: Omit<SeparatorProps, "orientation">) => {
  return (
    <Separator orientation="horizontal" thickness={thickness} {...props} />
  );
};
