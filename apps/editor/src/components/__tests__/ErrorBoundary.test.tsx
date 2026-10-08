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

    const fallback = container.querySelector('[role="alert"]');
    expect(fallback?.textContent).toContain("The editor encountered an error");
    expect(fallback?.textContent).toContain("render failed");
    expect(fallback?.className).toBeTruthy();
    expect(getComputedStyle(fallback!).padding).toBe("32px");
    expect(getComputedStyle(fallback!.querySelector("h1")!).color).toBe(
      "rgb(198, 40, 40)",
    );
    expect(
      fallback?.querySelector('[aria-label="Error message"]')?.textContent,
    ).toContain("render failed");
    expect(fallback?.querySelectorAll("pre")[1].textContent).toContain(
      "Error: render failed",
    );
    expect(fallback?.querySelectorAll("pre")[2].textContent).toContain("Throw");
    expect(
      [...(fallback?.querySelectorAll("pre") ?? [])]
        .slice(1)
        .map((pre) => getComputedStyle(pre).textAlign),
    ).toEqual(["left", "left"]);
    expect(consoleError).toHaveBeenCalledWith(
      "Editor rendering failed",
      error,
      expect.any(String),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("retries rendering its children", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    const MaybeThrow = () => {
      if (shouldThrow) throw new Error("render failed");
      return <p>Editor is ready</p>;
    };
    const { container, root } = render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());

    expect(container.textContent).toContain("Editor is ready");

    act(() => root.unmount());
    container.remove();
  });
});
