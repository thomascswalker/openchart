import type { ReactNode } from "react";
import {
  flex,
  color,
  border,
  layout,
  padding,
  margin,
  space,
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
  styleFn,
} from "styled-system";
import classNames from "classnames";
import styles from "./Box.module.css";

type Styles = FlexProps &
  ColorProps &
  BorderProps &
  LayoutProps &
  PaddingProps &
  MarginProps &
  SpaceProps;

type ItemAlignment = "start" | "equal" | "end";

interface BoxProps extends Styles {
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
);

const Box = ({
  alignItems = "equal",
  children,
  className,
  ...props
}: BoxProps) => {
  const boxStyle = getSystemStyle(props);
  const boxClassName = classNames(
    className,
    styles["ui-box"],
    styles[`ui-box-align-items-${alignItems}`],
  );

  return (
    <div className={boxClassName} style={boxStyle}>
      {children}
    </div>
  );
};

export default Box;
