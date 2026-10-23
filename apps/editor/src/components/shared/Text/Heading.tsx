import classNames from "classnames";
import type { JSX } from "react/jsx-runtime";
import { getTextSystemStyles } from "./textStyles";
import type { TextProps } from "./Text";
import styles from "./text.module.css";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps extends TextProps {
  level?: HeadingLevel;
}

const Heading = ({
  className,
  children,
  level = 1,
  disabled = false,
  ...props
}: HeadingProps) => {
  const safeLevel = Math.min(Math.max(level, 1), 6);
  const style = getTextSystemStyles(props);
  const headingClassName = classNames(
    styles["ui-heading"],
    disabled ? styles["ui-heading-disabled"] : null,
    styles[`ui-h${safeLevel}`],
    className,
  );
  const HeadingTag = `h${safeLevel}` as keyof JSX.IntrinsicElements;
  return (
    <HeadingTag disabled={disabled} className={headingClassName} style={style}>
      {children}
    </HeadingTag>
  );
};

const H1 = (props: HeadingProps) => (
  <Heading level={1} className="ui-h1" {...props} />
);
const H2 = (props: HeadingProps) => (
  <Heading level={2} className="ui-h2" {...props} />
);
const H3 = (props: HeadingProps) => (
  <Heading level={3} className="ui-h3" {...props} />
);
const H4 = (props: HeadingProps) => (
  <Heading level={4} className="ui-h4" {...props} />
);
const H5 = (props: HeadingProps) => (
  <Heading level={5} className="ui-h5" {...props} />
);
const H6 = (props: HeadingProps) => (
  <Heading level={6} className="ui-h6" {...props} />
);

export { Heading, H1, H2, H3, H4, H5, H6 };
export type { HeadingLevel, HeadingProps };
