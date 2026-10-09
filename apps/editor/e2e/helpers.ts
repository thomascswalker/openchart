import { Midi } from "@midiedit/core";
import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SONG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/views/tests/song.mid",
);

const fixture = new Midi(new Uint8Array(readFileSync(SONG_PATH)));
export const MIDI_END_TICK = Math.max(
  0,
  ...fixture.tracks.map((track) =>
    track.events.reduce((tick, event) => tick + event.deltaTime, 0),
  ),
);

export async function loadSong(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "showOpenFilePicker", undefined);
    Reflect.set(globalThis, "showSaveFilePicker", undefined);
  });
  await page.goto("/");
  await page.getByRole("menuitem", { name: "File" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /^Open/ }).click();
  await (await chooser).setFiles(SONG_PATH);
  await expect(
    page.locator('output[aria-label^="Playback position"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Jump to Beginning" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Jump to End" })).toBeEnabled();
}

export function panel(page: Page, index: number): Locator {
  return page.getByTestId("viewport-panel").nth(index);
}

export async function switchView(
  viewport: Locator,
  view: "highway" | "piano-roll",
): Promise<void> {
  const name = view === "highway" ? "Highway" : "Piano Roll";
  await viewport.getByRole("button", { name, exact: true }).click();
  await expect(viewport).toHaveAttribute("data-view", view);
  await expect(viewport.locator(".midi-view-host canvas")).toBeVisible();
  await expect(viewport).toHaveAttribute("data-camera-tick", /.+/);
}

export async function addViewport(viewport: Locator): Promise<void> {
  const page = viewport.page();
  const count = await page.getByTestId("viewport-panel").count();
  await viewport.getByRole("button", { name: /Split .* to the right/ }).click();
  await expect(page.getByTestId("viewport-panel")).toHaveCount(count + 1);
}

export async function playheadTick(viewport: Locator): Promise<number> {
  const label = await viewport
    .page()
    .locator('output[aria-label^="Playback position: tick"]')
    .getAttribute("aria-label");
  const match = label?.match(/tick (\d+)/);
  if (!match) throw new Error(`Could not parse playback tick from ${label}`);
  return Number(match[1]);
}

export async function cameraTick(viewport: Locator): Promise<number> {
  return Number(await viewport.getAttribute("data-camera-tick"));
}

export async function visibleTickSpan(viewport: Locator): Promise<number> {
  return Number(await viewport.getAttribute("data-visible-tick-span"));
}

export async function canvasShot(viewport: Locator): Promise<Buffer> {
  return viewport.locator(".midi-view-host canvas").screenshot();
}

export async function expectCanvasToChange(
  viewport: Locator,
  action: () => Promise<void>,
): Promise<void> {
  const page = viewport.page();
  await page.mouse.move(2, 2);
  const before = await canvasShot(viewport);
  await action();
  await expect
    .poll(
      async () => {
        await page.mouse.move(2, 2);
        return !(await canvasShot(viewport)).equals(before);
      },
      { timeout: 3_000, message: "canvas pixels never changed" },
    )
    .toBe(true);
}

export async function scrubTimeline(
  viewport: Locator,
  fraction: number,
): Promise<void> {
  const page = viewport.page();
  const canvas = page.getByTestId("viewport-timeline").locator("canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Timeline canvas is not visible");
  const x = bounds.x + bounds.width * fraction;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

export async function expectPlayheadFramed(
  viewport: Locator,
  view: "highway" | "piano-roll",
): Promise<void> {
  const tick = await playheadTick(viewport);
  const camera = await cameraTick(viewport);
  if (view === "highway") {
    expect(Math.abs(camera - tick + (4 / 3) * 480)).toBeLessThan(1);
    return;
  }
  const span = await visibleTickSpan(viewport);
  expect(tick).toBeGreaterThanOrEqual(camera);
  expect(tick).toBeLessThanOrEqual(camera + span);
}
