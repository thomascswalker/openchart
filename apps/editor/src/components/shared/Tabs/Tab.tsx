import { useEffect, useState, type ReactNode } from "react";
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
import { Button } from "../Button";
import type { Icon } from "../Icon/Icon";

type Orientation = "horizontal" | "vertical";
type Alignment = "top" | "right" | "bottom" | "left";
type Styles = FlexProps & ColorProps & BorderProps & LayoutProps;
const getSystemStyle: styleFn = compose(flex, color, border, layout);

interface TabBodyProps extends Styles {
  children?: ReactNode;
}

const TabBody = ({ children }: TabBodyProps) => {
  return <div className={styles["ui-tab-body"]}>{children}</div>;
};

interface TabListProps extends Styles {
  options?: ReactNode[];
  orientation?: Orientation;
  alignment?: Alignment;
  activeIndex: number;
  onClick?: (index: number) => void;
}

const TabList = ({
  options,
  orientation = "horizontal",
  alignment = "top",
  activeIndex,
  onClick,
}: TabListProps) => {
  const tabListClassName = classNames(
    styles["ui-tab-list"],
    styles[`ui-tab-list-${orientation}`],
    styles[`ui-tab-list-${alignment}`],
  );
  return (
    <div className={tabListClassName}>
      {options?.map((o: ReactNode, index) => (
        <Button
          key={index}
          onClick={() => onClick?.(index)}
          checked={index === activeIndex}
        >
          {o}
        </Button>
      ))}
    </div>
  );
};

interface TabsProps extends Styles {
  options?: ReactNode[];
  alignment?: Alignment;
  onTabChange?: (index: number) => void;
  children?: ReactNode[];
}

const TabContainer = ({
  options = [],
  alignment = "top",
  onTabChange,
  children = [],
  ...props
}: TabsProps) => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const tabStyle = getSystemStyle(props);

  const handleTabClick = (index: number) => {
    setActiveTabIndex(index);
    onTabChange?.(index);
  };

  useEffect(() => {
    if (!Array.isArray(children)) {
      throw new Error("Children of a TabContainer must be an array.");
    }

    if (children.length !== options.length) {
      throw new Error("Child/Option mismatch.");
    }
  }, [children]);

  const orientation: Orientation =
    alignment === "top" || alignment === "bottom" ? "horizontal" : "vertical";
  const tabClassName = classNames(
    styles["ui-tab-container"],
    styles[`ui-tab-container-${alignment}`],
  );

  return (
    <div className={tabClassName} style={tabStyle}>
      <TabList
        options={options}
        orientation={orientation}
        alignment={alignment}
        activeIndex={activeTabIndex}
        onClick={handleTabClick}
      />
      <TabBody>{children[activeTabIndex] || null}</TabBody>
    </div>
  );
};

export default TabContainer;
export type { TabsProps, TabListProps, TabBodyProps };
