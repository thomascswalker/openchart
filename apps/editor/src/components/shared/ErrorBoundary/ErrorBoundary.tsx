import { Component, type ErrorInfo, type ReactNode } from "react";
import { Section } from "../Section";

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
      return (
        <Section
          style={{
            flexDirection: "column",
            padding: "20px",
            scrollBehavior: "auto",
          }}
        >
          <h2 style={{ textAlign: "left" }}>STACK TRACE</h2>
          <pre
            style={{
              color: "var(--red-40)",
              textAlign: "left",
              border: "solid 1px var(--neutral-40)",
              padding: "16px",
            }}
          >
            {this.state.error.stack?.trimStart() ?? "Stack trace unavailable."}
          </pre>
          <h2 style={{ textAlign: "left" }}>COMPONENT STACK</h2>
          <pre
            style={{
              color: "var(--red-40)",
              textAlign: "left",
              border: "solid 1px var(--neutral-40)",
              padding: "16px",
            }}
          >
            {this.state.info?.componentStack?.trimStart() ??
              "Component stack unavailable."}
          </pre>
        </Section>
      );
    }

    return this.props.children;
  }
}
