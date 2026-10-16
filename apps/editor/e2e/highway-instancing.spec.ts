import { expect, test } from "@playwright/test";
import { ChannelMessage, MetaType, Midi, MidiTrack } from "@openchart/core";
import {
  cameraTick,
  canvasShot,
  loadSong,
  panel,
  switchView,
} from "./helpers.js";

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
  events.sort(
    (left, right) => left.tick - right.tick || left.order - right.order,
  );
  let previousTick = 0;
  track.events = events.map(({ tick, event }) => {
    const deltaTime = tick - previousTick;
    previousTick = tick;
    return { ...event, deltaTime };
  });
  midi.tracks = [track];
  return midi.toBuffer();
}

test("highway note and sustain batches render deterministically with compact resources", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureFramebuffer", true);
  });
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  const canvas = viewport.locator(".midi-view-host canvas");
  const initialCameraTick = await cameraTick(viewport);
  await canvas.click();
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(() => cameraTick(viewport)).not.toBe(initialCameraTick);
  await expect
    .poll(() => canvas.getAttribute("data-render-calls"))
    .not.toBeNull();
  const screenshot = await canvasShot(viewport);
  expect((await canvasShot(viewport)).equals(screenshot)).toBe(true);
  expect(
    Number(await canvas.getAttribute("data-visible-notes")),
  ).toBeGreaterThan(0);
  expect(
    Number(await canvas.getAttribute("data-visible-sustains")),
  ).toBeGreaterThan(0);
  expect(Number(await canvas.getAttribute("data-render-calls"))).toBeLessThan(
    100,
  );
  expect(Number(await canvas.getAttribute("data-scene-objects"))).toBeLessThan(
    500,
  );
  expect(Number(await canvas.getAttribute("data-geometry-count"))).toBeLessThan(
    100,
  );
});

test("highway drum batches render kick and cymbal notes", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureFramebuffer", true);
  });
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  await viewport.getByRole("button", { name: "Select DRUMS" }).click();
  await expect(
    viewport.getByRole("button", { name: "Select DRUMS" }),
  ).toHaveAttribute("aria-pressed", "true");
  const canvas = viewport.locator(".midi-view-host canvas");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-visible-notes")))
    .toBeGreaterThan(0);
  expect((await canvasShot(viewport)).equals(await canvasShot(viewport))).toBe(
    true,
  );
  const renderCalls = Number(await canvas.getAttribute("data-render-calls"));
  const sceneObjects = Number(await canvas.getAttribute("data-scene-objects"));
  const instancedCounts = JSON.parse(
    (await canvas.getAttribute("data-instanced-note-counts")) ?? "{}",
  ) as Record<string, number>;
  expect(renderCalls).toBeLessThan(100);
  expect(sceneObjects).toBeLessThan(500);
  expect(instancedCounts.kick).toBeGreaterThan(0);
  expect(instancedCounts.cymbal).toBeGreaterThan(0);
});

test("instanced note capacity grows beyond the legacy pool without drops", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureFramebuffer", true);
    Reflect.set(globalThis, "showOpenFilePicker", undefined);
    Reflect.set(globalThis, "showSaveFilePicker", undefined);
  });
  await page.goto("/");
  await page.getByRole("menuitem", { name: "File" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /^Import/ }).click();
  await (
    await chooser
  ).setFiles({
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
    .poll(async () => Number(await canvas.getAttribute("data-visible-notes")))
    .toBe(3_000);
  await canvas.hover({ position: { x: 1, y: 1 } });
  await expect
    .poll(() => canvas.getAttribute("data-note-batch-dirty"))
    .toBe("false");
  const noteCounts = JSON.parse(
    (await canvas.getAttribute("data-instanced-note-counts")) ?? "{}",
  ) as Record<string, number>;
  const capacities = JSON.parse(
    (await canvas.getAttribute("data-batch-capacities")) ?? "{}",
  ) as Record<string, number>;
  const drawDurationMs = Number(
    await canvas.getAttribute("data-highway-draw-ms"),
  );
  const instanceWriteDurationMs = Number(
    await canvas.getAttribute("data-instance-buffer-write-ms"),
  );

  expect(noteCounts.note).toBe(3_000);
  expect(capacities.note).toBe(4_096);
  expect(await canvas.getAttribute("data-dropped-notes")).toBe("0");
  expect(Number.isFinite(drawDurationMs)).toBe(true);
  expect(Number.isFinite(instanceWriteDurationMs)).toBe(true);
  if (process.env.OPENCHART_PERF_LOG === "1") {
    console.log(`3,000-note highway draw(): ${drawDurationMs.toFixed(3)} ms`);
    console.log(
      `3,000-note instance buffer writes: ${instanceWriteDurationMs.toFixed(3)} ms`,
    );
    console.log(
      `Note state rebuilt: ${await canvas.getAttribute("data-note-batch-dirty")}`,
    );
  }
});
