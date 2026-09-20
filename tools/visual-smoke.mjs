import { chromium } from "playwright";

const baseUrl =
  process.env.VISUAL_SMOKE_URL ?? "http://127.0.0.1:4173/midiview/";
const outputDirectory = process.env.VISUAL_SMOKE_OUTPUT ?? "artifacts";

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=swiftshader"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.locator('[data-command="open"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles("packages/views/tests/song.mid");
  await page
    .locator(".track-row")
    .filter({ hasText: "LEAD GUITAR" })
    .first()
    .click();
  await page.waitForTimeout(500);

  const canvas = page.locator(".midi-view-host canvas").first();
  await canvas.waitFor({ state: "visible" });
  await page.screenshot({
    path: `${outputDirectory}/piano-roll.png`,
    fullPage: true,
  });

  await page
    .locator(".midi-view__controls select")
    .nth(1)
    .selectOption("highway");
  await page.waitForTimeout(1500);
  await page
    .locator(".midi-view-host canvas")
    .first()
    .waitFor({ state: "visible" });
  await page.screenshot({
    path: `${outputDirectory}/highway.png`,
    fullPage: true,
  });
} finally {
  await browser.close();
}
