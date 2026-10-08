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

const CodeBlock = ({ children }: { children: string }) => (
  <Section
    padding="var(--size-med)"
    border="1px solid var(--red-40)"
    borderRadius="var(--radius-med)"
  >
    <Code className={styles["ui-code-block"]} color="var(--red-40)">
      {children.split("\n").map((line, index) => (
        <span className={styles["ui-code-line"]} key={index}>
          <span>{index}: </span>
          <span>{line}</span>
        </span>
      ))}
    </Code>
  </Section>
);

export { Code, CodeBlock };
export type { CodeProps };
