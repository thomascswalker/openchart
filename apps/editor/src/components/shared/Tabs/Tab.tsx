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

type Styles = FlexProps & ColorProps & BorderProps & LayoutProps;
const getSystemStyle: styleFn = compose(flex, color, border, layout);

interface TabBodyProps extends Styles {
  children?: ReactNode;
}

const TabBody = ({ children }: TabBodyProps) => {
  return <div className={styles["ui-tab-body"]}>{children}</div>;
};

interface TabListProps extends Styles {
  options?: string[];
  activeIndex: number;
  onClick?: (index: number) => void;
}

const TabList = ({ options, activeIndex, onClick }: TabListProps) => {
  const tabListClassName = classNames(styles["ui-tab-list"]);
  return (
    <div className={tabListClassName}>
      {options?.map((o: string, index) => (
        <Button
          onClick={() => onClick?.(index)}
          checked={index === activeIndex}
          borderBottomLeftRadius={0}
          borderBottomRightRadius={0}
        >
          {o}
        </Button>
      ))}
    </div>
  );
};

interface TabsProps extends Styles {
  options?: string[];
  children?: ReactNode[];
  onTabChange?: (index: number) => void;
}

const TabContainer = ({
  onTabChange,
  options = [],
  children = [],
  ...props
}: TabsProps) => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const tabStyle = getSystemStyle(props);
  const tabClassName = classNames(styles["ui-tab-container"]);

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

  return (
    <div className={tabClassName} style={tabStyle}>
      <TabList
        options={options}
        activeIndex={activeTabIndex}
        onClick={handleTabClick}
      />
      <TabBody>{children[activeTabIndex] || null}</TabBody>
    </div>
  );
};

export default TabContainer;
export type { TabsProps, TabListProps, TabBodyProps };
