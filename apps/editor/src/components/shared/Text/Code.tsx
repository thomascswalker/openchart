import classNames from "classnames";
import { Section } from "../Section";
import type { TextProps } from "./Text";
import { Text } from "./Text";
import styles from "./text.module.css";

type CodeProps = TextProps;

const Code = ({ children, className, ...props }: CodeProps) => {
  const codeClassName = classNames(
    styles["ui-text"],
    styles["ui-code"],
    className,
  );
  return (
    <Text className={codeClassName} {...props}>
      {children}
    </Text>
  );
};

type Variation = "normal" | "error";

interface CodeBlockProps extends CodeProps {
  variation?: Variation;
}

const CodeBlock = ({ variation = "normal", children }: CodeBlockProps) => {
  const color = variation === "error" ? "var(--red-40)" : "var(--text-primary)";
  const border =
    variation === "error"
      ? "1px solid var(--red-40)"
      : "1px solid var(--text-primary)";
  return (
    <Section
      padding="var(--size-med)"
      border={border}
      borderRadius="var(--radius-med)"
    >
      <Code className={styles["ui-code-block"]} color={color}>
        {children &&
          String(children)
            .split("\n")
            .map((line, index) => (
              <span className={styles["ui-code-line"]} key={index}>
                <span>{index} | </span>
                <span>{line}</span>
              </span>
            ))}
      </Code>
    </Section>
  );
};

export { Code, CodeBlock };
export type { CodeProps };
