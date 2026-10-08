import type { CSSProperties, HTMLAttributes } from "react";
import classNames from "classnames";
import styles from "./section.module.css";
import {
  compose,
  space,
  color,
  layout,
  border,
  flexbox,
  system,
  type styleFn,
  type FlexboxProps,
  type SpaceProps,
  type ColorProps,
  type LayoutProps,
  type BorderProps,
  type ResponsiveValue,
} from "styled-system";

const gap = system({ gap: { property: "gap", scale: "space" } });
const getSystemStyles: styleFn = compose(
  space,
  color,
  layout,
  border,
  flexbox,
  gap,
);

type GapProps = { gap?: ResponsiveValue<CSSProperties["gap"]> };
type SystemProps = SpaceProps &
  ColorProps &
  LayoutProps &
  BorderProps &
  FlexboxProps &
  GapProps;

interface SectionProps
  extends
    Omit<HTMLAttributes<HTMLElement>, keyof SystemProps | "style">,
    SystemProps {}

const defaultSectionProps: Pick<SectionProps, "flexDirection"> = {
  flexDirection: "column",
};

const systemPropNames = new Set(getSystemStyles.propNames ?? []);

const Section = ({ className, children, ...props }: SectionProps) => {
  const style = getSystemStyles({ ...defaultSectionProps, ...props });
  const htmlProps = Object.fromEntries(
    Object.entries(props).filter(
      ([propName]) => propName !== "style" && !systemPropNames.has(propName),
    ),
  );
  const sectionClassName: string = classNames(styles["ui-section"], className);

  return (
    <section {...htmlProps} className={sectionClassName} style={style}>
      {children}
    </section>
  );
};

export { Section };
export type { SectionProps };
