import { describe, expect, it } from "vitest";
import { GeometryPool } from "./pool";

describe("GeometryPool", () => {
  it("keeps logical keys bound while growing lazily", () => {
    let nextId = 0;
    const pool = new GeometryPool({ create: () => ({ id: nextId++ }) });
    pool.prewarm(1);
    const first = pool.acquire("note:a", 1);
    expect(pool.acquire("note:a", 2)).toBe(first);
    expect(pool.acquire("note:b", 2)?.id).toBe(1);
    expect(pool.highWaterMark).toBe(2);
  });

  it("resets and reuses objects at the frame boundary", () => {
    const reset: number[] = [];
    const pool = new GeometryPool({
      create: () => ({ id: reset.length }),
      reset: (item) => reset.push(item.id),
    });
    const item = pool.acquire("old", 1);
    pool.acquire("current", 2);
    pool.releaseUnused(2);
    expect(reset).toEqual([item!.id]);
    expect(pool.acquire("new", 3)).toBe(item);
  });

  it("does not exceed its cap", () => {
    const pool = new GeometryPool({ cap: 1, create: () => ({}) });
    expect(pool.acquire("a")).not.toBeNull();
    expect(pool.acquire("b")).toBeNull();
  });
});
