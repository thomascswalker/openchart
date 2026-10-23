import { describe, expect, it } from "vitest";
import { moduleId } from "../../platform/modules";
import {
  allBindings,
  globalBindings,
  highwayBindings,
  pianoRollBindings,
} from "../index";

// Action ids come from file paths, exactly like the ActionRegistry derives them.
const actionFiles = import.meta.glob([
  "../../actions/**/*.ts",
  "!../../actions/**/__tests__/**",
  "!../../actions/__mocks__/**",
]);
const actionIds = new Set(
  Object.keys(actionFiles)
    .map((path) =>
      moduleId(path.replace("../../actions/", "../actions/"), "actions"),
    )
    .filter((id): id is string => id !== null),
);

const normalize = (hotkey: string): string => hotkey.toLowerCase();

describe("input bindings", () => {
  it("only reference registered actions", () => {
    const missing = allBindings
      .filter((binding) => !actionIds.has(binding.action))
      .map((binding) => `${binding.id} -> ${binding.action}`);
    expect(missing).toEqual([]);
  });

  it("have unique ids", () => {
    const ids = allBindings.map((binding) => binding.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("do not repeat a chord within a scope and target", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const binding of allBindings) {
      const key = `${binding.scope}|${binding.target}|${binding.options.eventType ?? "keydown"}|${normalize(binding.hotkey)}`;
      const existing = seen.get(key);
      if (existing) duplicates.push(`${existing} and ${binding.id}`);
      else seen.set(key, binding.id);
    }
    expect(duplicates).toEqual([]);
  });

  it("keep tables in their own scope", () => {
    expect(globalBindings.every((b) => b.scope === "global")).toBe(true);
    expect(highwayBindings.every((b) => b.scope === "highway")).toBe(true);
    expect(pianoRollBindings.every((b) => b.scope === "pianoroll")).toBe(true);
  });

  it("only share a chord between a view scope and global on purpose", () => {
    // Overrides are allowed, but each one must be listed here so it is a
    // conscious decision. Today there are none.
    const intentionalOverrides: string[] = [];
    const global = new Map(
      globalBindings.map((b) => [
        `${b.target}|${b.options.eventType ?? "keydown"}|${normalize(b.hotkey)}`,
        b.id,
      ]),
    );
    const overrides = [...highwayBindings, ...pianoRollBindings]
      .filter((b) =>
        global.has(
          `${b.target}|${b.options.eventType ?? "keydown"}|${normalize(b.hotkey)}`,
        ),
      )
      .map(
        (b) =>
          `${b.id} overrides ${global.get(`${b.target}|${b.options.eventType ?? "keydown"}|${normalize(b.hotkey)}`)}`,
      );
    expect(overrides).toEqual(intentionalOverrides);
  });

  it("derive ids from scope, action and variant", () => {
    const toggle = allBindings.find(
      (b) => b.action === "highway.toggle-lane-note" && b.variant === "3.shift",
    );
    expect(toggle?.id).toBe("highway.highway.toggle-lane-note.3.shift");
    expect(toggle?.args).toEqual([2, true]);
    expect(toggle?.target).toBe("canvas");
  });

  it("releases each lane on keyup", () => {
    const release = highwayBindings.find(
      (binding) =>
        binding.action === "highway.release-lane-note" &&
        binding.variant === "3",
    );
    expect(release).toMatchObject({
      hotkey: "3",
      args: [2],
      target: "document",
      options: { eventType: "keyup", ignoreInputs: false },
    });
  });
});
