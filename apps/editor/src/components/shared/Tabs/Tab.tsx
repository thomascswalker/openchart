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
import styles from "./Tab.module.css";

type Styles = FlexProps & ColorProps & BorderProps & LayoutProps;

interface TabProps extends Styles {
  children?: ReactNode;
}

const getSystemStyle: styleFn = compose(flex, color, border, layout);

const Tab = ({ children, ...props }: TabProps) => {
  const tabStyle = getSystemStyle(props);
  const tabClassName = classNames(styles["ui-tab"]);

  return (
    <div className={tabClassName} style={tabStyle}>
      {children}
    </div>
  );
};

export default Tab;
