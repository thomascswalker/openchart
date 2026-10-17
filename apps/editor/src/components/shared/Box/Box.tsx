import type { ReactNode } from "react";
import { flex, color, border, layout, compose } from "styled-system";
import type {
  FlexProps,
  ColorProps,
  BorderProps,
  LayoutProps,
  styleFn,
} from "styled-system";
import classNames from "classnames";
import styles from "./Box.module.css";

type Styles = FlexProps & ColorProps & BorderProps & LayoutProps;

type ItemAlignment = "start" | "equal" | "end";

interface BoxProps extends Styles {
  alignItems?: ItemAlignment;
  children?: ReactNode;
}

const getSystemStyle: styleFn = compose(flex, color, border, layout);

const Box = ({ alignItems = "equal", children, ...props }: BoxProps) => {
  const boxStyle = getSystemStyle(props);
  const boxClassName = classNames(
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
