import { forwardRef, type ReactNode } from "react";
import {
  flex,
  color,
  border,
  layout,
  padding,
  margin,
  space,
  flexbox,
  compose,
} from "styled-system";
import type {
  PaddingProps,
  MarginProps,
  FlexProps,
  ColorProps,
  BorderProps,
  LayoutProps,
  SpaceProps,
  FlexboxProps,
  styleFn,
} from "styled-system";
import classNames from "classnames";
import styles from "./Box.module.css";
import { gap, type GapProps } from "../../../util/css";

type Styles = FlexProps &
  ColorProps &
  BorderProps &
  LayoutProps &
  PaddingProps &
  MarginProps &
  FlexboxProps &
  SpaceProps &
  GapProps;

type ItemAlignment = "start" | "equal" | "end";

interface BoxProps extends Styles {
  ref?: HTMLDivElement;
  alignItems?: ItemAlignment;
  children?: ReactNode;
  className?: string;
}

const getSystemStyle: styleFn = compose(
  flex,
  color,
  border,
  layout,
  padding,
  margin,
  space,
  flexbox,
  gap,
);

const Box = forwardRef<HTMLDivElement, BoxProps>(
  ({ alignItems = "equal", children, className, ...props }, ref) => {
    const boxStyle = getSystemStyle(props);
    const boxClassName = classNames(
      className,
      styles["ui-box"],
      styles[`ui-box-align-items-${alignItems}`],
    );

    return (
      <div ref={ref} className={boxClassName} style={boxStyle}>
        {children}
      </div>
    );
  },
);

export { Box };
