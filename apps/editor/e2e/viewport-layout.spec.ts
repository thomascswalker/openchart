import { expect, test } from "@playwright/test";
import { loadSong, panel } from "./helpers.js";

test("resizes a viewport command panel by dragging its splitter", async ({
  page,
}) => {
  await loadSong(page);
  const viewport = panel(page, 0);
  const splitter = viewport.getByRole("separator", { name: "Resize panels" });
  const box = await splitter.boundingBox();
  expect(box).not.toBeNull();
  await expect(splitter).toHaveAttribute("aria-valuenow", "400");

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 100,
    box!.y + box!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(splitter).toHaveAttribute("aria-valuenow", "500");
});
