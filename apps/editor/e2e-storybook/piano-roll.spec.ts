import { expect, test } from "@playwright/test";

const POPULATED_STORY =
  "/iframe.html?id=views-piano-roll--populated-editable&viewMode=story";
const EMPTY_STORY =
  "/iframe.html?id=views-piano-roll--empty-chart&viewMode=story";
const TEMPO_STORY =
  "/iframe.html?id=views-piano-roll--dense-tempo-event&viewMode=story";
const VOCALS_STORY = "/iframe.html?id=views-piano-roll--vocals&viewMode=story";

/** Vocals layout: keyboard width, then 120 px per quarter (4 ticks/px). */
const KEYBOARD_WIDTH = 64;
const VOCAL_GRID_TOP = 36 + 5 * 14;
const xForTick = (tick: number) => KEYBOARD_WIDTH + tick / 4;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "__captureFramebuffer", true);
  });
});

test("renders the real piano roll canvas and header events", async ({
  page,
}) => {
  await page.goto(POPULATED_STORY);
  const story = page.getByTestId("piano-roll-story");
  const canvas = page.locator(".piano-roll-story__renderer canvas");

  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-visible-notes", /^[1-9]\d*$/);
  await expect(page.locator(".piano-roll-header-input")).toHaveCount(1);
  await expect(
    page.locator(".piano-roll-story__renderer").getByText("[section Verse]"),
  ).toBeAttached();
  await expect(page.getByTestId("note-count")).toHaveText("Notes: 4");
  await expect(page.getByTestId("selected-track")).toHaveText(
    "Track 1: LEAD GUITAR",
  );
  await expect
    .poll(async () => (await canvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(900);
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0)
    .toBeGreaterThan(400);

  const framebuffer = await canvas.getAttribute("data-framebuffer");
  expect(framebuffer).not.toBeNull();
  const screenshot = await canvas.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(1_000);
  expect(await story.getAttribute("data-visible-tick-span")).toMatch(
    /^[1-9]\d*/,
  );
});

test("supports seek, playback, and edit locking against the fixture MIDI", async ({
  page,
}) => {
  await page.goto(POPULATED_STORY);
  const canvas = page.locator(".piano-roll-story__renderer canvas");
  const story = page.getByTestId("piano-roll-story");
  const notesBefore = await story.getAttribute("data-note-data");

  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Piano-roll canvas has no layout bounds");
  await page.mouse.click(bounds.x + 424, bounds.y + 500);
  await expect(page.getByTestId("current-tick")).toHaveText("Tick: 1440");

  const noteCenter = { x: bounds.x + 124, y: bounds.y + 261 };
  await page.mouse.click(noteCenter.x, noteCenter.y);
  await page.getByRole("button", { name: "Play" }).click();
  await expect(story).toHaveAttribute("data-is-playing", "true");
  await canvas.evaluate((element) => element.focus());
  await page.keyboard.press("ArrowUp");
  await expect(story).toHaveAttribute("data-note-data", notesBefore ?? "");
  await expect
    .poll(async () =>
      Number(
        (await page.getByTestId("current-tick").textContent())?.replace(
          /\D/g,
          "",
        ),
      ),
    )
    .toBeGreaterThan(1_440);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(story).toHaveAttribute("data-is-playing", "false");
  await page.mouse.click(noteCenter.x, noteCenter.y);
  await canvas.evaluate((element) => element.focus());
  await page.keyboard.press("ArrowUp");
  await expect(story).toHaveAttribute(
    "data-note-data",
    /"pitch":73,"start":0,"duration":480/,
  );
});

test("creates a snapped note by dragging and updates the same MIDI instance", async ({
  page,
}) => {
  await page.goto(POPULATED_STORY);
  const story = page.getByTestId("piano-roll-story");
  const canvas = page.locator(".piano-roll-story__renderer canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Piano-roll canvas has no layout bounds");

  await page.mouse.move(bounds.x + 600, bounds.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 720, bounds.y + 300, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByTestId("note-count")).toHaveText("Notes: 5");
  await expect(story).toHaveAttribute(
    "data-note-data",
    /"pitch":70,"start":1920,"duration":480/,
  );
  await expect(page.getByTestId("edit-transaction")).toHaveText(
    "Transaction: Ready",
  );
});

test("moves, resizes, and deletes notes in the same MIDI track", async ({
  page,
}) => {
  await page.goto(POPULATED_STORY);
  const story = page.getByTestId("piano-roll-story");
  const canvas = page.locator(".piano-roll-story__renderer canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Piano-roll canvas has no layout bounds");

  await page.mouse.move(bounds.x + 124, bounds.y + 261);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 244, bounds.y + 243, { steps: 5 });
  await page.mouse.up();
  await expect(story).toHaveAttribute(
    "data-note-data",
    /"pitch":73,"start":480,"duration":480/,
  );

  await page.mouse.move(bounds.x + 302, bounds.y + 243);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 424, bounds.y + 243, { steps: 5 });
  await page.mouse.up();
  await expect(story).toHaveAttribute(
    "data-note-data",
    /"pitch":73,"start":480,"duration":960/,
  );

  await page.mouse.click(bounds.x + 244, bounds.y + 243);
  await canvas.evaluate((element) => element.focus());
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("note-count")).toHaveText("Notes: 3");
});

test("seeking beyond the viewport advances the camera to follow the playhead", async ({
  page,
}) => {
  await page.goto(POPULATED_STORY);
  const story = page.getByTestId("piano-roll-story");

  await page.getByLabel("Seek tick").fill("5000");
  await expect(page.getByTestId("current-tick")).toHaveText("Tick: 5000");
  await expect
    .poll(async () => Number(await story.getAttribute("data-camera-tick")))
    .toBeGreaterThan(0);
  const cameraTick = Number(await story.getAttribute("data-camera-tick"));
  const visibleTickSpan = Number(
    await story.getAttribute("data-visible-tick-span"),
  );
  expect(cameraTick).toBeLessThan(5_000);
  expect(cameraTick + visibleTickSpan).toBeGreaterThan(5_000);
});

test("playback advances according to the active MIDI tempo", async ({
  page,
}) => {
  await page.goto(TEMPO_STORY);
  await expect(page.getByTestId("piano-roll-story")).toBeVisible();
  const tickReadout = page.getByTestId("current-tick");

  const measureTicksPerMillisecond = async (startTick: number) => {
    await page.getByLabel("Seek tick").fill(String(startTick));
    const startedAt = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "Play" }).click();
    await page.waitForTimeout(700);
    const elapsedMs =
      (await page.evaluate(() => performance.now())) - startedAt;
    const endTick = Number(
      (await tickReadout.textContent())?.replace(/\D/g, ""),
    );
    await page.getByRole("button", { name: "Pause" }).click();
    return (endTick - startTick) / elapsedMs;
  };

  const normalTempoRate = await measureTicksPerMillisecond(0);
  const fasterTempoRate = await measureTicksPerMillisecond(2_400);

  expect(normalTempoRate).toBeGreaterThan(0);
  expect(fasterTempoRate).toBeGreaterThan(normalTempoRate * 1.25);
});

test("track and snap controls update without replacing the canvas", async ({
  page,
}) => {
  await page.goto(POPULATED_STORY);
  const canvas = page.locator(".piano-roll-story__renderer canvas");
  await canvas.evaluate((element) =>
    Reflect.set(globalThis, "__pianoRollCanvas", element),
  );

  await page.getByRole("listbox", { name: "Selected track" }).click();
  await page.getByRole("option", { name: "2: BASS" }).last().click();
  await expect(page.getByTestId("selected-track")).toHaveText("Track 2: BASS");
  await expect(page.getByTestId("note-count")).toHaveText("Notes: 2");
  expect(
    await canvas.evaluate((element) =>
      Object.is(element, Reflect.get(globalThis, "__pianoRollCanvas")),
    ),
  ).toBe(true);

  const snapToggle = page.getByLabel("Snap to grid");
  await expect(snapToggle).toBeChecked();
  await snapToggle.uncheck();
  await expect(snapToggle).not.toBeChecked();
  await snapToggle.check();

  await page.getByRole("listbox", { name: "Snap denominator" }).click();
  await page.getByRole("option", { name: "1/8" }).last().click();
  await expect(page.locator("#piano-roll-snap-denominator")).toHaveValue("8");
});

test("empty chart keeps the grid but disables playback; remount resets state", async ({
  page,
}) => {
  await page.goto(EMPTY_STORY);
  const canvas = page.locator(".piano-roll-story__renderer canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-visible-notes", "0");
  await expect(page.locator(".piano-roll-header-input")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("note-count")).toHaveText("Notes: 0");

  await page.goto(POPULATED_STORY);
  await page.getByLabel("Seek tick").fill("3000");
  await expect(page.getByTestId("current-tick")).toHaveText("Tick: 3000");
  await page.reload();
  await expect(page.getByTestId("current-tick")).toHaveText("Tick: 0");
  await expect(page.locator(".piano-roll-story__renderer canvas")).toHaveCount(
    1,
  );
  await expect(page.locator(".piano-roll-header-input")).toHaveCount(1);

  await page.setViewportSize({ width: 900, height: 720 });
  await expect
    .poll(async () => (await canvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(700);
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0)
    .toBeGreaterThan(400);

  for (let mount = 0; mount < 2; mount += 1) {
    await page.reload();
    await expect(
      page.locator(".piano-roll-story__renderer canvas"),
    ).toHaveCount(1);
    await expect(page.locator(".piano-roll-header-input")).toHaveCount(1);
  }
});

test.describe("vocals profile", () => {
  test("renders lanes and lyrics, and prompts for a new note's lyric", async ({
    page,
  }) => {
    await page.goto(VOCALS_STORY);
    const story = page.getByTestId("piano-roll-story");
    const renderer = page.locator(".piano-roll-story__renderer");
    const canvas = renderer.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(story).toHaveAttribute("data-profile", "vocals");
    await expect(renderer.getByText("Sing", { exact: true })).toBeAttached();
    await expect(renderer.getByText("Phrase", { exact: true })).toBeAttached();
    await expect(renderer.getByText("C4", { exact: true })).toBeAttached();
    // Vocal headers show lyrics only, never "[section New]" on click.
    await expect(page.getByTestId("note-count")).toHaveText("Notes: 11");

    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Piano-roll canvas has no layout bounds");
    const y = bounds.y + VOCAL_GRID_TOP + 120;
    // Ticks 1440-1920 are free in the fixture.
    await page.mouse.move(bounds.x + xForTick(1460), y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + xForTick(1900), y, { steps: 4 });
    await page.mouse.up();

    const input = page.locator(".piano-roll-header-input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(page.getByTestId("note-count")).toHaveText("Notes: 12");
    await page.keyboard.type("née");
    await page.keyboard.press("Enter");

    await expect
      .poll(async () => JSON.parse((await story.getAttribute("data-lyrics"))!))
      .toContainEqual([1440, "née"]);
    await expect(page.getByTestId("edit-transaction")).toHaveText(
      "Transaction: Ready",
    );
  });

  test("Escape removes a just-created note and its pending lyric", async ({
    page,
  }) => {
    await page.goto(VOCALS_STORY);
    const story = page.getByTestId("piano-roll-story");
    const canvas = page.locator(".piano-roll-story__renderer canvas");
    await expect(canvas).toBeVisible();
    const lyricsBefore = await story.getAttribute("data-lyrics");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Piano-roll canvas has no layout bounds");
    const y = bounds.y + VOCAL_GRID_TOP + 120;
    await page.mouse.move(bounds.x + xForTick(1460), y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + xForTick(1900), y, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator(".piano-roll-header-input")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("note-count")).toHaveText("Notes: 11");
    await expect(story).toHaveAttribute("data-lyrics", lyricsBefore ?? "");
  });
});
