import type { HTMLAttributes, ReactNode } from "react";
import classNames from "classnames";
import styles from "./section.module.css";
import {
  compose,
  space,
  color,
  layout,
  border,
  flex,
  type styleFn,
} from "styled-system";

const getSystemStyles: styleFn = compose(space, color, layout, border, flex);

interface SectionProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

const Section = ({ className, children, ...props }: SectionProps) => {
  const style = getSystemStyles(props);
  const sectionClassName: string = classNames(styles["ui-section"], className);

  return (
    <section className={sectionClassName} style={style} {...props}>
      {children}
    </section>
  );
};

export { Section };
export type { SectionProps };
