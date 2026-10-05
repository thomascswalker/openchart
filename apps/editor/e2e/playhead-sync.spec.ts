import { expect, test } from "@playwright/test";
import {
  addViewport,
  cameraTick,
  canvasShot,
  expectCanvasToChange,
  expectPlayheadFramed,
  loadSong,
  MIDI_END_TICK,
  panel,
  playheadTick,
  scrubTimeline,
  switchView,
} from "./helpers.js";

const HIGHWAY_CAMERA_OFFSET = -(4 / 3) * 480;

test("stable canvas screenshot control", async ({ page }) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  await page.mouse.move(2, 2);
  const first = await canvasShot(viewport);
  const second = await canvasShot(viewport);
  expect(second.equals(first)).toBe(true);
});

test("T1: arrow keys move the highway camera with the playhead", async ({
  page,
}) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  const canvas = viewport.locator(".midi-view-host canvas");
  await canvas.click();

  const initialCamera = await cameraTick(viewport);
  const initialPlayhead = await playheadTick(viewport);
  const before = await canvasShot(viewport);
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowUp");
  }

  await expect
    .poll(() => playheadTick(viewport))
    .toBeGreaterThan(initialPlayhead);
  const advancedPlayhead = await playheadTick(viewport);
  const advancedCamera = await cameraTick(viewport);
  expect(advancedCamera - initialCamera).toBe(
    advancedPlayhead - initialPlayhead,
  );
  await expect
    .poll(async () => !(await canvasShot(viewport)).equals(before))
    .toBe(true);

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect.poll(() => cameraTick(viewport)).toBe(initialCamera);
});

for (const view of ["highway", "piano-roll"] as const) {
  test(`T2: jump to end and beginning frame ${view}`, async ({ page }) => {
    await loadSong(page);
    const viewport = panel(page, 0);
    await switchView(viewport, view);
    const initialCamera = await cameraTick(viewport);

    await expectCanvasToChange(viewport, () =>
      page.getByRole("button", { name: "Jump to End" }).click(),
    );
    await expect.poll(() => playheadTick(viewport)).toBe(MIDI_END_TICK);
    expect(await cameraTick(viewport)).not.toBe(initialCamera);
    await expectPlayheadFramed(viewport, view);

    await expectCanvasToChange(viewport, () =>
      page.getByRole("button", { name: "Jump to Beginning" }).click(),
    );
    await expect.poll(() => playheadTick(viewport)).toBe(0);
    await expect.poll(() => cameraTick(viewport)).toBe(initialCamera);
  });
}

for (const [originView, otherView] of [
  ["highway", "highway"],
  ["piano-roll", "highway"],
  ["highway", "piano-roll"],
] as const) {
  test(`T3: ${originView} timeline scrubbing moves the other ${otherView} viewport`, async ({
    page,
  }) => {
    await loadSong(page);
    const origin = panel(page, 0);
    await switchView(origin, originView);
    await addViewport(origin);
    const other = panel(page, 1);
    await switchView(other, otherView);
    const initialOtherCamera = await cameraTick(other);

    await expectCanvasToChange(other, () => scrubTimeline(origin, 0.7));
    await expect
      .poll(async () => playheadTick(other))
      .toBe(await playheadTick(origin));
    expect(await cameraTick(other)).not.toBe(initialOtherCamera);
    await expectPlayheadFramed(other, otherView);

    const beforeReturn = await cameraTick(origin);
    await expectCanvasToChange(origin, () => scrubTimeline(other, 0.1));
    await expect
      .poll(async () => playheadTick(origin))
      .toBe(await playheadTick(other));
    expect(await cameraTick(origin)).not.toBe(beforeReturn);
    await expectPlayheadFramed(origin, originView);
  });
}

test("T4: timeline viewport box redraws when the highway camera pans", async ({
  page,
}) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  const timeline = viewport.getByTestId("viewport-timeline").locator("canvas");
  const bounds = await viewport.locator(".midi-view-host canvas").boundingBox();
  if (!bounds) throw new Error("Highway canvas is not visible");
  const before = await timeline.screenshot();
  const initialCamera = await cameraTick(viewport);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -5_000);

  await expect.poll(() => cameraTick(viewport)).not.toBe(initialCamera);
  await expect
    .poll(async () => !(await timeline.screenshot()).equals(before))
    .toBe(true);
});

test("T5a: manual highway panning stays put while paused", async ({ page }) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  const bounds = await viewport.locator(".midi-view-host canvas").boundingBox();
  if (!bounds) throw new Error("Highway canvas is not visible");
  const initialCamera = await cameraTick(viewport);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -500);
  await expect.poll(() => cameraTick(viewport)).not.toBe(initialCamera);
  const pannedCamera = await cameraTick(viewport);
  await page.waitForTimeout(500);
  expect(await cameraTick(viewport)).toBe(pannedCamera);
});

test("T5b: changing the snap denominator does not move the camera", async ({
  page,
}) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  await viewport.locator(".midi-view-host canvas").click();
  const initialCamera = await cameraTick(viewport);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  expect(await cameraTick(viewport)).toBe(initialCamera);
});

test("T5c: playback advances and pauses both highway viewports", async ({
  page,
}) => {
  await loadSong(page);
  const first = panel(page, 0);
  await switchView(first, "highway");
  await addViewport(first);
  const second = panel(page, 1);
  await switchView(second, "highway");
  const initialTick = await playheadTick(first);
  const firstCamera = await cameraTick(first);
  const secondCamera = await cameraTick(second);

  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect.poll(() => playheadTick(first)).toBeGreaterThan(initialTick);
  await expect.poll(() => cameraTick(first)).toBeGreaterThan(firstCamera);
  await expect.poll(() => cameraTick(second)).toBeGreaterThan(secondCamera);
  await page.getByRole("button", { name: "Play/Pause" }).click();
  const pausedTick = await playheadTick(first);
  const pausedFirstCamera = await cameraTick(first);
  const pausedSecondCamera = await cameraTick(second);
  await page.waitForTimeout(300);
  expect(await playheadTick(first)).toBe(pausedTick);
  expect(await cameraTick(first)).toBe(pausedFirstCamera);
  expect(await cameraTick(second)).toBe(pausedSecondCamera);
});

test("T5d: pressing play reframes a manually panned highway", async ({
  page,
}) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  await switchView(viewport, "highway");
  const bounds = await viewport.locator(".midi-view-host canvas").boundingBox();
  if (!bounds) throw new Error("Highway canvas is not visible");
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.wheel(0, -500);
  const pannedCamera = await cameraTick(viewport);
  await page.getByRole("button", { name: "Play/Pause" }).click();
  await expect.poll(() => cameraTick(viewport)).not.toBe(pannedCamera);
  await page.getByRole("button", { name: "Play/Pause" }).click();
  const pausedTick = await playheadTick(viewport);
  await expect
    .poll(async () => (await cameraTick(viewport)) - pausedTick)
    .toBeCloseTo(HIGHWAY_CAMERA_OFFSET, 0);
});
