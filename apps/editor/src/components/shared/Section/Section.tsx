import type { HTMLAttributes, ReactNode } from "react";
import classNames from "classnames";
import type { Direction } from "../props";

import styles from "./section.module.css";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  direction?: Direction;
  children?: ReactNode;
  padding?: string;
  margin?: string;
}

const Section = ({
  direction = "row",
  padding,
  margin,
  role,
  className,
  style,
  children,
  ...props
}: SectionProps) => {
  const sectionClassName: string = classNames(
    styles["ui-section"],
    styles[direction],
    className,
  );
  return (
    <section
      className={sectionClassName}
      style={{
        ...style,
        ...(padding === undefined ? {} : { padding }),
        ...(margin === undefined ? {} : { margin }),
      }}
      role={role}
      {...props}
    >
      {children}
    </section>
  );
};

export { Section };
export type { SectionProps };
