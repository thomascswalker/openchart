import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl =
  process.env.VISUAL_SMOKE_URL ?? "http://127.0.0.1:4173/midiview/";
const outputDirectory = process.env.VISUAL_SMOKE_OUTPUT ?? "artifacts";

async function collectDiagnostics(canvas) {
  return canvas.evaluate((element) => {
    const contextType = element.dataset.threeContextType ?? "webgl2";
    const gl =
      element.getContext(contextType) ??
      element.getContext(contextType === "webgl2" ? "webgl" : "webgl2");
    if (!gl) {
      return {
        width: element.width,
        height: element.height,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        webgl: false,
      };
    }

    const pixels = new Uint8Array(4);
    gl.readPixels(
      Math.floor(gl.drawingBufferWidth / 2),
      Math.floor(gl.drawingBufferHeight / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    const attributes = gl.getContextAttributes();
    return {
      width: element.width,
      height: element.height,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      drawingBufferWidth: gl.drawingBufferWidth,
      drawingBufferHeight: gl.drawingBufferHeight,
      contextLost: gl.isContextLost(),
      contextAttributes: attributes
        ? {
            alpha: attributes.alpha,
            preserveDrawingBuffer: attributes.preserveDrawingBuffer,
          }
        : null,
      pixel: [...pixels],
      rendererPixel: element.dataset.threePixel ?? null,
      rendererContextType: element.dataset.threeContextType ?? null,
      rendererContextAttributes: element.dataset.threeContextAttributes ?? null,
      rendererGlError: element.dataset.threeGlError ?? null,
      sceneChildren: element.dataset.threeSceneChildren ?? null,
      renderCalls: element.dataset.threeRenderCalls ?? null,
      renderTriangles: element.dataset.threeRenderTriangles ?? null,
      webgl: true,
    };
  });
}

async function captureCanvasAndInterface(page, canvas, name) {
  const dataUrl = await canvas.evaluate((element) => element.toDataURL());
  const encoded = dataUrl.split(",", 2)[1];
  if (!encoded) {
    throw new Error(`Canvas ${name} did not produce a PNG data URL`);
  }
  await writeFile(
    `${outputDirectory}/${name}-canvas.png`,
    Buffer.from(encoded, "base64"),
  );

  // Headless Chromium's WebGL compositor can omit SwiftShader canvases from
  // page screenshots. Replace only the captured canvas with its own pixels so
  // the interface screenshot still records exactly what Three rendered.
  await canvas.evaluate((element, source) => {
    const image = document.createElement("img");
    image.src = source;
    image.width = element.width;
    image.height = element.height;
    image.className = element.className;
    image.style.cssText = element.style.cssText;
    element.replaceWith(image);
  }, dataUrl);
  await page.screenshot({
    path: `${outputDirectory}/${name}.png`,
    fullPage: true,
  });
}

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
  await writeFile(
    `${outputDirectory}/piano-roll-diagnostics.json`,
    JSON.stringify(await collectDiagnostics(canvas), null, 2),
  );
  await captureCanvasAndInterface(page, canvas, "piano-roll");

  await page
    .locator(".midi-view__controls select")
    .nth(1)
    .selectOption("highway");
  await page.waitForTimeout(1500);
  await page
    .locator(".midi-view-host canvas")
    .first()
    .waitFor({ state: "visible" });
  await writeFile(
    `${outputDirectory}/highway-diagnostics.json`,
    JSON.stringify(
      await collectDiagnostics(page.locator(".midi-view-host canvas").first()),
      null,
      2,
    ),
  );
  await captureCanvasAndInterface(
    page,
    page.locator(".midi-view-host canvas").first(),
    "highway",
  );
} finally {
  await browser.close();
}
