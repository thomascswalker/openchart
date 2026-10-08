import { Component, type ErrorInfo, type ReactNode } from "react";
import { Section } from "../Section";
import { Code, H2 } from "../Text";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
}

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
      const stackTrace =
        this.state.error.stack?.trimStart() ?? "Stack trace unavailable.";
      const componentStack =
        this.state.info?.componentStack?.trimStart() ??
        "Component stack unavailable.";

      return (
        <Section
          style={{
            flexDirection: "column",
            padding: "20px",
            scrollBehavior: "auto",
          }}
        >
          <H2>STACK TRACE</H2>
          <Code>{stackTrace}</Code>
          <H2>COMPONENT STACK</H2>
          <Code>{componentStack}</Code>
        </Section>
      );
    }

    return this.props.children;
  }
}
