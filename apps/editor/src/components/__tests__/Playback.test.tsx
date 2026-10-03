import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Runtime } from "../Runtime";
import { usePlayback } from "../../hooks/usePlayback";

function FeedbackConsumer() {
  const { setActiveView, stopPreview } = usePlayback();

  useEffect(() => {
    setActiveView("highway");
    stopPreview();
  }, [setActiveView, stopPreview]);

  return null;
}

describe("Playback", () => {
  it("makes feedback available before descendant effects run", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);

    expect(() =>
      act(() => {
        root.render(
          <StrictMode>
            <Runtime>
              <FeedbackConsumer />
            </Runtime>
          </StrictMode>,
        );
      }),
    ).not.toThrow();

    act(() => root.unmount());
    container.remove();
  });
});
