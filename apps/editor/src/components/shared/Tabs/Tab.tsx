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
import { H6 } from "../Text";

type Orientation = "horizontal" | "vertical";
type Alignment = "top" | "right" | "bottom" | "left";
type Styles = FlexProps & ColorProps & BorderProps & LayoutProps;
const getSystemStyle: styleFn = compose(flex, color, border, layout);

interface TabBodyProps extends Styles {
  title: string;
  children?: ReactNode;
}

const TabBody = ({ title, children }: TabBodyProps) => {
  return (
    <div className={styles["ui-tab-body"]}>
      <div style={{ padding: "var(--size-small)" }}>
        <H6>{title.toUpperCase()}</H6>
      </div>
      {children}
    </div>
  );
};

interface TabOption {
  title: string;
  icon: ReactNode;
}

interface TabListProps extends Styles {
  options?: TabOption[];
  flat?: boolean;
  orientation?: Orientation;
  alignment?: Alignment;
  activeIndex: number | null;
  onClick?: (index: number) => void;
}

const TabList = ({
  options,
  flat = false,
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
      {options?.map((o, index) => (
        <Button
          key={index}
          flat={flat && index !== activeIndex}
          onClick={() => onClick?.(index)}
          checked={index === activeIndex}
        >
          {o.icon}
        </Button>
      ))}
    </div>
  );
};

interface TabsProps extends Styles {
  options?: TabOption[];
  flat?: boolean;
  alignment?: Alignment;
  collapsible?: boolean;
  onTabChange?: (index: number) => void;
  children?: ReactNode[];
}

const TabContainer = ({
  options = [],
  flat = false,
  alignment = "top",
  collapsible = false,
  onTabChange,
  children = [],
  ...props
}: TabsProps) => {
  const [activeTabIndex, setActiveTabIndex] = useState<number | null>(0);

  const isCollapsed = collapsible && activeTabIndex === null;
  const tabStyle = {
    ...getSystemStyle(props),
    ...(isCollapsed ? { width: "max-content", flex: "0 0 auto" } : {}),
  };

  const handleTabClick = (index: number) => {
    setActiveTabIndex((current) =>
      collapsible && current === index ? null : index,
    );
    onTabChange?.(index);
  };

  useEffect(() => {
    if (!Array.isArray(children)) {
      throw new Error("Children of a TabContainer must be an array.");
    }

    if (children.length !== options.length) {
      throw new Error("Child/Option mismatch.");
    }
  }, [children, options.length]);

  const orientation: Orientation =
    alignment === "top" || alignment === "bottom" ? "horizontal" : "vertical";
  const tabClassName = classNames(styles["ui-tab-container"], {
    [styles[`ui-tab-container-${alignment}`]]: true,
    [styles["ui-tab-container-collapsed"]]: isCollapsed,
  });

  return (
    <div
      className={tabClassName}
      style={tabStyle}
      data-collapsed={isCollapsed || undefined}
    >
      <TabList
        options={options}
        flat={flat}
        orientation={orientation}
        alignment={alignment}
        activeIndex={activeTabIndex}
        onClick={handleTabClick}
      />
      {activeTabIndex === null ? null : (
        <TabBody title={options[activeTabIndex].title}>
          {children[activeTabIndex] || null}
        </TabBody>
      )}
    </div>
  );
};

export default TabContainer;
export type { TabsProps, TabListProps, TabBodyProps, TabOption };
