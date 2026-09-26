import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("v0.1 fixed box design, layers, 3D, restore and export", async ({ page }, testInfo) => {
  await page.goto("/editor");
  await expect(page.getByText("90 × 90 × 235 mm").first()).toBeVisible();
  await expect(page.getByText("CUT 刀线")).toBeVisible();
  await expect(page.getByText("CREASE 压痕")).toBeVisible();
  await expect(page.getByText("已保存到本机")).toBeVisible();

  await page.getByRole("button", { name: "T 文字" }).click();
  await expect(page.getByRole("textbox", { name: "文字内容" })).toHaveValue("HELLO");
  await expect(page.locator(".layer-row")).toHaveCount(1);
  await page.getByRole("textbox", { name: "文字内容" }).fill("HELLO");
  await page.getByRole("spinbutton", { name: "X · mm" }).fill("22");
  await page.getByRole("spinbutton", { name: "宽 · mm" }).fill("53");
  await page.getByRole("spinbutton", { name: "旋转 · °" }).fill("12");
  await page.getByRole("button", { name: "粗体" }).click();
  await page.getByRole("button", { name: "斜体" }).click();
  await page.locator('input[type="color"]').fill("#bb3322");
  await expect(page.locator(".layer-row")).toContainText("HELLO");
  const faceCanvas = await page.getByTestId("face-canvas").locator("canvas").first().boundingBox();
  expect(faceCanvas).not.toBeNull();
  const pxPerMm = faceCanvas!.width / 90;
  const textX = faceCanvas!.x + (22 + 53 / 2) * pxPerMm;
  const textY = faceCanvas!.y + (25 + 15 / 2) * pxPerMm;
  await page.mouse.move(textX, textY);
  await page.mouse.down();
  await page.mouse.move(textX + 18, textY + 12, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByRole("spinbutton", { name: "X · mm" }).inputValue())).toBeGreaterThan(22);

  const logoBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 48; canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#bb3322"; context.fillRect(0, 0, 48, 48);
    context.fillStyle = "white"; context.font = "bold 30px Arial"; context.fillText("L", 14, 34);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"][aria-label="上传图片"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(logoBase64, "base64") });
  await expect(page.locator(".layer-row")).toHaveCount(2);
  await expect(page.locator(".layer-row").first()).toContainText("logo.png");
  await expect(page.locator(".net-overview image")).toHaveCount(5);
  await page.locator(".layer-row").first().getByRole("button", { name: "隐藏图层" }).click();
  await expect(page.locator(".layer-row").first().getByRole("button", { name: "显示图层" })).toBeVisible();
  await page.locator(".layer-row").first().getByRole("button", { name: "显示图层" }).click();
  await page.locator(".layer-row").first().getByRole("button", { name: "锁定图层" }).click();
  await expect(page.locator(".layer-row").first().getByRole("button", { name: "解锁图层" })).toBeVisible();
  await page.locator(".layer-row").first().getByRole("button", { name: "解锁图层" }).click();
  await page.getByRole("button", { name: "置底" }).click();
  await expect(page.locator(".layer-row").last()).toContainText("logo.png");
  await page.getByRole("button", { name: "置顶" }).click();
  await expect(page.locator(".layer-row").first()).toContainText("logo.png");
  await page.screenshot({ path: testInfo.outputPath("editor-2d.png") });

  await page.getByRole("tab", { name: "3D 预览" }).click();
  await expect(page.getByTestId("three-viewport").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "右侧", exact: true }).last().click();
  await page.waitForTimeout(850);
  const rightImage = await page.getByTestId("three-viewport").locator("canvas").screenshot();
  await page.getByRole("button", { name: "正面", exact: true }).last().click();
  await page.waitForTimeout(850);
  const frontBefore = await page.getByTestId("three-viewport").locator("canvas").screenshot();
  expect(Buffer.compare(rightImage, frontBefore)).not.toBe(0);
  await page.screenshot({ path: testInfo.outputPath("editor-3d.png") });
  await page.getByRole("button", { name: "复位" }).click();
  await page.getByRole("tab", { name: "2D 设计" }).click();
  await page.getByRole("button", { name: "选择 logo.png" }).click();
  await page.getByRole("spinbutton", { name: "Y · mm" }).fill("65");
  await page.getByRole("spinbutton", { name: "宽 · mm" }).fill("38");
  await page.getByRole("spinbutton", { name: "旋转 · °" }).fill("-15");
  await expect(page.getByRole("spinbutton", { name: "Y · mm" })).toHaveValue("65");
  await page.getByRole("tab", { name: "3D 预览" }).click();
  await page.getByRole("button", { name: "正面", exact: true }).last().click();
  await page.waitForTimeout(850);
  const frontAfter = await page.getByTestId("three-viewport").locator("canvas").screenshot();
  expect(Buffer.compare(frontBefore, frontAfter)).not.toBe(0);
  await page.getByRole("tab", { name: "2D 设计" }).click();
  await expect(page.getByText("已保存到本机")).toBeVisible();
  await page.reload();
  await expect(page.locator(".layer-row")).toHaveCount(2);
  await page.getByRole("button", { name: "选择 logo.png" }).click();
  await expect(page.getByRole("spinbutton", { name: "Y · mm" })).toHaveValue("65");
  await expect(page.getByRole("spinbutton", { name: "宽 · mm" })).toHaveValue("38");
  await expect(page.getByRole("spinbutton", { name: "旋转 · °" })).toHaveValue("-15");

  const pngPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 ▾" }).click();
  await page.getByRole("menuitem", { name: "当前面 PNG" }).click();
  const png = await pngPromise;
  expect(png.suggestedFilename()).toMatch(/front.*\.png$/);
  const pngBytes = readFileSync(await png.path());
  expect(pngBytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(pngBytes.readUInt32BE(16)).toBe(1200);
  const jpgPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 ▾" }).click();
  await page.getByRole("menuitem", { name: "当前面 JPG" }).click();
  const jpg = await jpgPromise;
  expect(jpg.suggestedFilename()).toMatch(/front.*\.jpg$/);
  const jpgBytes = readFileSync(await jpg.path());
  expect(jpgBytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");

  await page.getByRole("button", { name: "删除选中图层" }).click();
  await expect(page.locator(".layer-row")).toHaveCount(1);
});

test("preset SVG, undo/redo and legacy IndexedDB migration", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 20; canvas.height = 20;
    canvas.getContext("2d")!.fillRect(0, 0, 20, 20);
    const blob = await (await fetch(canvas.toDataURL("image/png"))).blob();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("diecut-preview", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("designs");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("designs", "readwrite");
        transaction.objectStore("designs").put({ version: 1, selectedFace: "front", faces: {
          front: { blob, name: "old-logo.png", settings: { fit: "contain", opacity: 80, scale: 100, offsetX: 0, offsetY: 0, rotation: 0 } },
        } }, "snap-lock-90x90x235");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto("/editor");
  await expect(page.locator(".layer-row")).toContainText("old-logo.png");
  await page.getByRole("button", { name: "纪念徽章" }).click();
  await expect(page.locator(".layer-row")).toHaveCount(2);
  await page.getByRole("button", { name: "↶" }).click();
  await expect(page.locator(".layer-row")).toHaveCount(1);
  await page.getByRole("button", { name: "↷" }).click();
  await expect(page.locator(".layer-row")).toHaveCount(2);
  await expect(page.locator(".net-overview image")).toHaveCount(5);
});
