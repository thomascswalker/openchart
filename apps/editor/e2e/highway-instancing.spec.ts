import { expect, test } from "@playwright/test";
import { ChannelMessage, MetaType, Midi, MidiTrack } from "@midiedit/core";
import { canvasShot, loadSong, panel, switchView } from "./helpers.js";

const SETTINGS_KEY = "midiedit.application-settings";

async function configureInstancing(page: import("@playwright/test").Page, enabled: boolean): Promise<void> {
  await page.evaluate(
    ({ key, instancing }) => {
      const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
      settings.version = 1;
      settings.rendering = { ...settings.rendering, instancing };
      localStorage.setItem(key, JSON.stringify(settings));
    },
    { key: SETTINGS_KEY, instancing: enabled },
  );
}

function createDenseMidi(noteCount: number): Uint8Array {
  const midi = new Midi();
  const track = new MidiTrack("LEAD GUITAR");
  const trackName = track.addTextEvent(MetaType.TrackName, 0, "LEAD GUITAR");
  const events: Array<{
    tick: number;
    order: number;
    event: (typeof track.events)[number];
  }> = [{ tick: 0, order: -1, event: trackName }];
  for (let index = 0; index < noteCount; index += 1) {
    const tick = Math.floor(index / 10);
    const pitch = 96 + (index % 5);
    events.push(
      {
        tick,
        order: index * 2 + 1,
        event: {
          deltaTime: 0,
          status: 0x90,
          channel: 0,
          messageType: ChannelMessage.NoteOn,
          data1: pitch,
          data2: 100,
        },
      },
      {
        tick: tick + 1,
        order: index * 2,
        event: {
          deltaTime: 0,
          status: 0x80,
          channel: 0,
          messageType: ChannelMessage.NoteOff,
          data1: pitch,
          data2: 0,
        },
      },
    );
  }
  events.sort((left, right) => left.tick - right.tick || left.order - right.order);
  let previousTick = 0;
  track.events = events.map(({ tick, event }) => {
    const deltaTime = tick - previousTick;
    previousTick = tick;
    return { ...event, deltaTime };
  });
  midi.tracks = [track];
  return midi.toBuffer();
}

test("instanced notes and tails match pooled rendering with fewer objects", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureThreeFramebuffer", true);
  });
  await page.goto("/");
  await configureInstancing(page, false);
  await loadSong(page);
  let viewport = panel(page, 0);
  await switchView(viewport, "highway");
  let canvas = viewport.locator(".midi-view-host canvas");
  await expect.poll(() => canvas.getAttribute("data-three-render-calls")).not.toBeNull();
  const pooled = await canvasShot(viewport);
  const pooledSustains = Number(
    await canvas.getAttribute("data-three-visible-sustains"),
  );
  const pooledCalls = Number(
    await canvas.getAttribute("data-three-render-calls"),
  );
  const pooledObjects = Number(
    await canvas.getAttribute("data-three-scene-objects"),
  );
  const pooledGeometries = Number(
    await canvas.getAttribute("data-three-geometry-count"),
  );

  await configureInstancing(page, true);
  await page.reload();
  await loadSong(page);
  viewport = panel(page, 0);
  await switchView(viewport, "highway");
  canvas = viewport.locator(".midi-view-host canvas");
  await expect.poll(() => canvas.getAttribute("data-three-render-calls")).not.toBeNull();
  const instanced = await canvasShot(viewport);
  const instancedSustains = Number(
    await canvas.getAttribute("data-three-visible-sustains"),
  );
  const instancedCalls = Number(
    await canvas.getAttribute("data-three-render-calls"),
  );
  const instancedObjects = Number(
    await canvas.getAttribute("data-three-scene-objects"),
  );
  const instancedGeometries = Number(
    await canvas.getAttribute("data-three-geometry-count"),
  );

  expect(pooledSustains).toBeGreaterThan(0);
  expect(instancedSustains).toBe(pooledSustains);
  expect(instancedCalls).toBeLessThan(pooledCalls);
  expect(instancedObjects).toBeLessThan(pooledObjects);
  expect(instancedGeometries).toBeLessThan(pooledGeometries);
  expect(instanced.equals(pooled)).toBe(true);
});

test("instanced drum kinds match pooled rendering", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureThreeFramebuffer", true);
  });
  await page.goto("/");
  await configureInstancing(page, false);
  await loadSong(page);
  let viewport = panel(page, 0);
  await switchView(viewport, "highway");
  await viewport.getByRole("button", { name: "Select DRUMS" }).click();
  await expect(viewport.getByRole("button", { name: "Select DRUMS" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  let canvas = viewport.locator(".midi-view-host canvas");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-three-visible-notes")))
    .toBeGreaterThan(0);
  const pooled = await canvasShot(viewport);
  const pooledCalls = Number(await canvas.getAttribute("data-three-render-calls"));
  const pooledObjects = Number(await canvas.getAttribute("data-three-scene-objects"));

  await configureInstancing(page, true);
  await page.reload();
  await loadSong(page);
  viewport = panel(page, 0);
  await switchView(viewport, "highway");
  await viewport.getByRole("button", { name: "Select DRUMS" }).click();
  await expect(viewport.getByRole("button", { name: "Select DRUMS" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  canvas = viewport.locator(".midi-view-host canvas");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-three-visible-notes")))
    .toBeGreaterThan(0);
  const instanced = await canvasShot(viewport);
  const instancedCalls = Number(await canvas.getAttribute("data-three-render-calls"));
  const instancedObjects = Number(await canvas.getAttribute("data-three-scene-objects"));
  const instancedCounts = JSON.parse(
    (await canvas.getAttribute("data-three-instanced-note-counts")) ?? "{}",
  ) as Record<string, number>;
  expect(instancedCalls).toBeLessThanOrEqual(pooledCalls);
  expect(instancedObjects).toBeLessThan(pooledObjects);
  expect(instancedCounts.kick).toBeGreaterThan(0);
  expect(instancedCounts.cymbal).toBeGreaterThan(0);
  expect(instanced.equals(pooled)).toBe(true);
});

test("instanced note capacity grows beyond the legacy pool without drops", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureThreeFramebuffer", true);
    Reflect.set(globalThis, "showOpenFilePicker", undefined);
    Reflect.set(globalThis, "showSaveFilePicker", undefined);
  });
  await page.goto("/");
  await configureInstancing(page, true);
  await page.reload();
  await page.getByRole("menuitem", { name: "File" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /^Open/ }).click();
  await (await chooser).setFiles({
    name: "dense-chart.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(createDenseMidi(3_000)),
  });
  await expect(
    page.locator('output[aria-label^="Playback position"]'),
  ).toBeVisible();

  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  const canvas = viewport.locator(".midi-view-host canvas");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-three-visible-notes")))
    .toBe(3_000);
  const noteCounts = JSON.parse(
    (await canvas.getAttribute("data-three-instanced-note-counts")) ?? "{}",
  ) as Record<string, number>;
  const capacities = JSON.parse(
    (await canvas.getAttribute("data-three-batch-capacities")) ?? "{}",
  ) as Record<string, number>;

  expect(noteCounts.note).toBe(3_000);
  expect(capacities.note).toBe(4_096);
  expect(await canvas.getAttribute("data-three-dropped-notes")).toBe("0");
});
