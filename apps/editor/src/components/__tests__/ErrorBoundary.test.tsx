import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../shared/ErrorBoundary/ErrorBoundary";

function render(element: ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a fallback and logs errors thrown by its children", () => {
    const error = new Error("render failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const Throw = () => {
      throw error;
    };
    const { container, root } = render(
      <ErrorBoundary>
        <Throw />
      </ErrorBoundary>,
    );

    const fallback = container.querySelector("section");
    expect(fallback?.querySelector("h1")?.textContent).toBe(
      "An error occurred",
    );
    expect(fallback?.textContent).toContain("Error: render failed");
    expect(fallback?.textContent).toContain("Throw");
    expect(consoleError).toHaveBeenCalledWith(
      "Editor rendering failed",
      error,
      expect.any(String),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("shows the failing child in the component stack", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const FailingEditor = () => {
      throw new Error("editor failed");
    };
    const { container, root } = render(
      <ErrorBoundary>
        <FailingEditor />
      </ErrorBoundary>,
    );

    expect(container.querySelector("h2")?.textContent).toBe("Stack");
    expect(container.textContent).toContain("Components");
    expect(container.textContent).toContain("FailingEditor");

    act(() => root.unmount());
    container.remove();
  });
});
