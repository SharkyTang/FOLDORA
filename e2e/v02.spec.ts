import { expect, test } from "@playwright/test";
import { copyFileSync, readFileSync } from "node:fs";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream, decodePDFRawStream } from "pdf-lib";
import { FONT_REGISTRY } from "../src/core/fonts/registry";

test("all 30 bundled font families can load representative glyphs", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByText("已保存到本机")).toBeVisible();
  const failures = await page.evaluate(async (fonts) => {
    const results = await Promise.all(fonts.map(async (font) => {
      try {
        const loaded = await document.fonts.load(`normal 400 18px "${font.family}"`, font.chinese ? "包装设计" : "FOLDORA 123");
        return loaded.length ? null : font.family;
      } catch { return font.family; }
    }));
    return results.filter(Boolean);
  }, FONT_REGISTRY.map((font) => ({ family: font.family, chinese: font.scripts.includes("chinese") })));
  expect(failures).toEqual([]);
});

test("v0.2 dimension, guides, folding, fonts, save and full RGB PDF", async ({ page }, testInfo) => {
  await page.goto("/editor");
  await expect(page.getByText("已保存到本机")).toBeVisible();
  await page.getByRole("spinbutton", { name: "宽 W · mm" }).fill("120");
  await page.getByRole("spinbutton", { name: "深 D · mm" }).fill("80");
  await page.getByRole("spinbutton", { name: "高 H · mm" }).fill("200");
  await page.getByRole("button", { name: "更新刀板" }).click();
  await expect(page.getByText("120 × 80 × 200 mm").first()).toBeVisible();
  await page.getByLabel("显示 BLEED").check();
  await page.getByLabel("显示 SAFE").check();
  await expect(page.locator(".net-overview svg path")).toHaveCount(6);
  await expect(page.locator(".face-bleed-guide")).toBeVisible();
  await expect(page.locator(".face-safe-guide")).toBeVisible();

  await page.getByRole("tab", { name: "3D 预览" }).click();
  const viewport = page.getByTestId("three-viewport");
  await expect(viewport.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "展开", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-fold-progress", "0");
  await page.waitForTimeout(850);
  await page.screenshot({ path: testInfo.outputPath("fold-0.png") });
  await page.getByRole("button", { name: "半折", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-fold-progress", "50");
  await page.waitForTimeout(850);
  await page.screenshot({ path: testInfo.outputPath("fold-50.png") });
  await page.getByRole("button", { name: "合盒", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-fold-progress", "100");
  await page.waitForTimeout(850);
  await page.screenshot({ path: testInfo.outputPath("fold-100.png") });

  await page.getByRole("tab", { name: "2D 设计" }).click();
  await page.getByRole("button", { name: "T 文字" }).click();
  await page.getByRole("textbox", { name: "文字内容" }).fill("包装设计");
  await page.getByRole("button", { name: "选择字体" }).click();
  await page.getByRole("searchbox", { name: "搜索字体" }).fill("Noto Sans SC");
  await page.locator(".font-option").first().click();
  await expect(page.getByRole("button", { name: "选择字体" })).toContainText("Noto Sans SC");
  await page.getByRole("spinbutton", { name: "字距 · mm" }).fill("0.5");
  await page.getByRole("spinbutton", { name: "行距 · 倍" }).fill("1.4");
  await page.getByRole("button", { name: "↶" }).click();
  await page.getByRole("button", { name: "↷" }).click();
  await page.getByRole("button", { name: "选择 包装设计" }).click();
  await expect(page.getByRole("spinbutton", { name: "行距 · 倍" })).toHaveValue("1.4");

  await page.locator(".face-picker button").filter({ hasText: "背面" }).click();
  await page.getByRole("button", { name: "T 文字" }).click();
  await page.getByRole("textbox", { name: "文字内容" }).fill("FOLDORA");
  await page.getByRole("button", { name: "选择字体" }).click();
  await page.getByRole("searchbox", { name: "搜索字体" }).fill("Playfair Display");
  await page.locator(".font-option").first().click();
  await expect(page.getByRole("button", { name: "选择字体" })).toContainText("Playfair Display");
  await expect(page.getByText("已保存到本机")).toBeVisible();
  await page.reload();
  await expect(page.getByText("120 × 80 × 200 mm").first()).toBeVisible();
  await page.getByRole("button", { name: "选择 FOLDORA" }).click();
  await expect(page.getByRole("button", { name: "选择字体" })).toContainText("Playfair Display");
  await expect(page.locator(".net-overview image")).toHaveCount(5);

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "导出刀板 PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/120x80x200.*\.pdf$/);
  const downloadedPath = await download.path();
  copyFileSync(downloadedPath, testInfo.outputPath("complete-net.pdf"));
  const bytes = readFileSync(downloadedPath);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  const pdfPage = doc.getPage(0);
  const actualWidthMm = pdfPage.getSize().width / 72 * 25.4;
  expect(actualWidthMm).toBeCloseTo(425, 1);
  const xobjects = pdfPage.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict)!;
  expect(xobjects.keys()).toHaveLength(5);
  for (const key of xobjects.keys()) {
    const image = doc.context.lookup(xobjects.get(key)!, PDFStream);
    expect(image.dict.get(PDFName.of("Width"))).toBeInstanceOf(PDFNumber);
    expect((image.dict.get(PDFName.of("Width")) as PDFNumber).asNumber()).toBeGreaterThan(900);
  }
  const contents = pdfPage.node.Contents() as PDFArray;
  const stream = doc.context.lookup(contents.get(0)!) as PDFRawStream;
  const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
  expect((operators.match(/\bDo\b/g) ?? [])).toHaveLength(5);
  expect((operators.match(/\bS\b/g) ?? []).length).toBeGreaterThan(15);
});

test("reference dimensions export an intact net and folded preview", async ({ page }, testInfo) => {
  await page.goto("/editor");
  await expect(page.getByText("已保存到本机")).toBeVisible();
  await page.getByRole("tab", { name: "3D 预览" }).click();
  const viewport = page.getByTestId("three-viewport");
  await page.getByRole("button", { name: "展开", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-fold-progress", "0");
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("reference-open.png") });
  await page.getByRole("button", { name: "合盒", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-fold-progress", "100");
  await page.screenshot({ path: testInfo.outputPath("reference-closed.png") });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出刀板 PDF" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  copyFileSync(path, testInfo.outputPath("reference-net.pdf"));
  const pdf = await PDFDocument.load(readFileSync(path));
  expect(pdf.getPage(0).getSize().width / 72 * 25.4).toBeCloseTo(385, 1);
});

test("v2 project receives an atomic original backup and old font blocks print", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const oldText = { id: "legacy-text", faceId: "front", type: "text", name: "文字", x: 12, y: 20,
      width: 54, height: 15, rotation: 0, opacity: 1, visible: true, locked: false,
      text: "旧项目", fontFamily: "PingFang SC", fontSizePt: 20, fontWeight: "normal", fontStyle: "normal",
      color: "#112233", textAlign: "center" };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("packaging-editor-v01", 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("projects"); request.result.createObjectStore("assets"); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("projects", "readwrite");
        transaction.objectStore("projects").put({ version: 2, templateId: "snap-lock-90x90x235",
          selectedFace: "front", faces: { front: [oldText], back: [], left: [], right: [], top: [], bottom: [] }, assets: {} }, "current");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto("/editor");
  await page.getByRole("button", { name: "选择 旧项目" }).click();
  await expect(page.getByRole("textbox", { name: "文字内容" })).toHaveValue("旧项目");
  await expect(page.locator(".preflight-issue.error")).toContainText("旧版系统字体");
  const versions = await page.evaluate(async () => {
    const request = indexedDB.open("packaging-editor-v01", 1);
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction("projects", "readonly");
    const get = (key: string) => new Promise<unknown>((resolve) => { const req = tx.objectStore("projects").get(key); req.onsuccess = () => resolve(req.result); });
    const versions = [await get("original-v2"), await get("current")].map((item) => (item as { version: number }).version);
    db.close(); return versions;
  });
  expect(versions).toEqual([2, 3]);
  await page.getByRole("button", { name: "导出刀板 PDF" }).click();
  await expect(page.locator(".toast[role=alert]")).toContainText("PDF 导出已阻止");
});

test("damaged saved record is reported without replacing it", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("packaging-editor-v01", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("projects"); request.result.createObjectStore("assets"); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({ version: 3, templateId: "snap-lock-carton", broken: true }, "current");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto("/editor");
  await expect(page.getByRole("status").first()).toContainText("本机项目读取失败");
  const record = await page.evaluate(async () => new Promise<{ broken: boolean }>((resolve, reject) => {
    const request = indexedDB.open("packaging-editor-v01", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("projects", "readonly");
      const get = tx.objectStore("projects").get("current");
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  }));
  expect(record.broken).toBe(true);
});
