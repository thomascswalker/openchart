import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HotkeysProvider, useHotkeys } from "../lib";

/**
 * Phase 0 spike: documents the library behaviour the input design relies on.
 * If an upgrade of @tanstack/react-hotkeys breaks one of these, the override
 * model (highway > global) needs revisiting.
 */

function Register({
  hotkey,
  callback,
}: {
  hotkey: string;
  callback: () => void;
}) {
  useHotkeys([{ hotkey: hotkey as never, callback }]);
  return null;
}

const roots: Array<{ root: Root; container: HTMLElement }> = [];

function mount(element: ReactNode): void {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  roots.push({ root, container });
}

function press(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key, bubbles: true, ...init }),
    );
  });
}

afterEach(() => {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe("hotkey scopes", () => {
  it("lets a nested scope override global for the same key", () => {
    const global = vi.fn();
    const highway = vi.fn();
    mount(
      <HotkeysProvider>
        <Register hotkey="Q" callback={global} />
        <HotkeysProvider scope="highway">
          <Register hotkey="Q" callback={highway} />
        </HotkeysProvider>
      </HotkeysProvider>,
    );
    press("q");
    expect(highway).toHaveBeenCalledTimes(1);
    expect(global).not.toHaveBeenCalled();
  });

  it("falls through to global for keys the view scope does not bind", () => {
    const global = vi.fn();
    const highway = vi.fn();
    mount(
      <HotkeysProvider>
        <Register hotkey="M" callback={global} />
        <HotkeysProvider scope="highway">
          <Register hotkey="Q" callback={highway} />
        </HotkeysProvider>
      </HotkeysProvider>,
    );
    press("m");
    expect(global).toHaveBeenCalledTimes(1);
    expect(highway).not.toHaveBeenCalled();
  });

  it("restores global when the view scope is disabled", () => {
    const global = vi.fn();
    const highway = vi.fn();
    mount(
      <HotkeysProvider>
        <Register hotkey="Q" callback={global} />
        <HotkeysProvider scope="highway" enabled={false}>
          <Register hotkey="Q" callback={highway} />
        </HotkeysProvider>
      </HotkeysProvider>,
    );
    press("q");
    expect(global).toHaveBeenCalledTimes(1);
    expect(highway).not.toHaveBeenCalled();
  });

  it("fires once per press when requireReset is set", () => {
    const callback = vi.fn();
    function Once() {
      useHotkeys([{ hotkey: "M" as never, callback }], {
        requireReset: true,
      } as never);
      return null;
    }
    mount(<Once />);
    act(() => {
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "m",
            bubbles: true,
            repeat: i > 0,
          }),
        );
      }
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
