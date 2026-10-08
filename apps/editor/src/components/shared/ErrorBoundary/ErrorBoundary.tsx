import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Section } from "../Section";
import { H2, Code, H1 } from "../Text";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

const addLineNumbers = (text: string) => {
  return text.split("\n").map((line, index) => (
    <Fragment key={index}>
      {index}: {line} <br />
    </Fragment>
  ));
};

const trimStackAt = (stack: string, marker: string) => {
  const markerIndex = stack.indexOf(marker);
  if (markerIndex === -1) return stack;

  const lineStart = stack.lastIndexOf("\n", markerIndex);
  return stack.slice(0, lineStart === -1 ? 0 : lineStart).trimEnd();
};

const trimComponentStackAtBoundary = (stack: string) => {
  const boundaryFrame = /^\s*at (?:ErrorBondary|ErrorBoundary)(?:\s|$|\()/;
  const lines = stack.split("\n");
  const boundaryIndex = lines.findIndex((line) => boundaryFrame.test(line));
  return boundaryIndex === -1
    ? stack
    : lines.slice(0, boundaryIndex).join("\n").trimEnd();
};

const CodeBlock = ({ children }: { children: ReactNode }) => (
  <Section padding="var(--size-med)" border="1px solid var(--red-40)">
    <Code color="var(--red-40)">{children}</Code>
  </Section>
);

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Editor rendering failed", error, info.componentStack);
    this.setState({ info });
  }

  render(): ReactNode {
    if (this.state.error) {
      const stackTrace = trimStackAt(
        this.state.error.stack?.trimStart() ?? "Stack trace unavailable.",
        "Object.react_stack_bottom_frame ",
      );
      const componentStack = trimComponentStackAtBoundary(
        this.state.info?.componentStack?.trimStart() ??
          "Component stack unavailable.",
      );

      return (
        <Section flexDirection="column">
          <H1>An error occurred</H1>
          <H2>Stack</H2>
          <CodeBlock>{addLineNumbers(stackTrace)}</CodeBlock>
          <H2>Components</H2>
          <CodeBlock>{addLineNumbers(componentStack)}</CodeBlock>
        </Section>
      );
    }

    return this.props.children;
  }
}
