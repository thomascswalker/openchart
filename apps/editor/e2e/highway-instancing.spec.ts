import { expect, test } from "@playwright/test";
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

test("instanced sustain tails match pooled rendering", async ({ page }) => {
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

  expect(pooledSustains).toBeGreaterThan(0);
  expect(instancedSustains).toBe(pooledSustains);
  expect(instancedCalls).toBeLessThan(pooledCalls);
  expect(instanced.equals(pooled)).toBe(true);
});
