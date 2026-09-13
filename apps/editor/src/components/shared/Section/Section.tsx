import type { ReactNode } from "react";
import classNames from "classnames";
import type { Direction } from "../props";
import styles from "./section.module.css";

interface SectionProps {
  direction?: Direction;
  children?: ReactNode;
}

const Section = ({ direction = "row", children }: SectionProps) => {
  const className: string = classNames(styles.section, styles[direction]);
  return <section className={className}>{children}</section>;
};

export { Section };
export type { SectionProps };
