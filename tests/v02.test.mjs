import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_DIMENSIONS, generateGeometry, guideContours, contourBounds, geometryIntegrityIssues, validateDimensions } from "../src/core/box/geometry.ts";
import { FONT_REGISTRY } from "../src/core/fonts/registry.ts";
import { migrateProjectV2, validateProjectV3 } from "../src/core/project/migration.ts";
import { emptyProject, effectiveDpi, faceSize, mmToPixels, mmToPt, pixelsToMm } from "../src/core/project/types.ts";
import { runPreflight } from "../src/core/print/preflight.ts";

const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/v01-geometry.json", import.meta.url), "utf8"));

test("the immutable v0.1 geometry remains the golden 90 × 90 × 235 net", () => {
  const generated = generateGeometry("snap-lock-carton", DEFAULT_DIMENSIONS);
  assert.equal(generated.perimeter, GOLDEN.perimeter);
  assert.equal(generated.backHole, GOLDEN.backHole);
  assert.deepEqual(generated.panels, GOLDEN.panels);
  assert.deepEqual(generated.creases.map(({ id, x1, y1, x2, y2 }) => ({ id, x1, y1, x2, y2 })), GOLDEN.creases);
  for (const [name, id] of [["glue", "glue"], ["dust", "dust-left"], ["tuck", "tuck"],
    ["bottomLeft", "bottom-left"], ["bottomBack", "bottom-back"],
    ["bottomRight", "bottom-right"], ["bottomFront", "bottom-front"]]) {
    assert.equal(generated.flaps.find((flap) => flap.id === id).path, GOLDEN.flapPaths[name]);
  }
});

test("four dimension sets derive independent panel widths, fold lines and bounds", () => {
  for (const [W, D, H, G] of [[90,90,235,15], [120,80,200,15], [100,60,180,12], [150,100,250,20]]) {
    const d = { widthMm: W, depthMm: D, heightMm: H, glueFlapMm: G };
    const g = generateGeometry("snap-lock-carton", d);
    assert.deepEqual(g.panels.slice(0, 4).map(({ id, x, width, height }) => ({ id, x, width, height })), [
      { id: "left", x: G, width: D, height: H },
      { id: "back", x: G + D, width: W, height: H },
      { id: "right", x: G + D + W, width: D, height: H },
      { id: "front", x: G + 2 * D + W, width: W, height: H },
    ]);
    assert.equal(g.panels[4].height, D);
    assert.equal(g.creases.length, 15);
    assert.equal(g.bounds.width, G + 2 * D + 2 * W);
    assert.deepEqual(faceSize("top", { dimensions: d }), { width: W, height: D });
    assert.ok(g.flaps.every((flap) => flap.path.length > 10));
    assert.deepEqual(geometryIntegrityIssues(g), []);
  }
  assert.ok(validateDimensions({ widthMm: 30, depthMm: 80, heightMm: 200, glueFlapMm: 15 }).length > 0);
  assert.throws(() => generateGeometry("snap-lock-carton", { widthMm: 90, depthMm: 90, heightMm: 235, glueFlapMm: 31 }));
});

test("offset guides follow both outside and hole contours", () => {
  const g = generateGeometry("snap-lock-carton", DEFAULT_DIMENSIONS);
  const bleed = guideContours(g, 3, "bleed");
  const safe = guideContours(g, 3, "safe");
  const outer = contourBounds(bleed.outer), inside = contourBounds(safe.outer);
  const cutHole = contourBounds(guideContours(g, 0, "safe").hole);
  assert.ok(outer.x < g.bounds.x && outer.width > g.bounds.width);
  assert.ok(inside.x > g.bounds.x && inside.width < g.bounds.width);
  assert.ok(contourBounds(bleed.hole).width < cutHole.width);
  assert.ok(contourBounds(safe.hole).width > cutHole.width);
});

test("unit conversions and effective DPI use the weaker image axis", () => {
  assert.ok(Math.abs(pixelsToMm(mmToPixels(90, 300), 300) - 90) < 1e-8);
  assert.ok(Math.abs(mmToPt(25.4) - 72) < 1e-8);
  assert.equal(Math.round(effectiveDpi(300, 25.4)), 300);
  assert.equal(Math.min(effectiveDpi(300, 25.4), effectiveDpi(150, 25.4)), 150);
});

test("font registry contains 30 distinct self-hosted families with six Chinese faces", () => {
  assert.equal(FONT_REGISTRY.length, 30);
  assert.equal(new Set(FONT_REGISTRY.map((font) => font.id)).size, 30);
  assert.equal(FONT_REGISTRY.filter((font) => font.scripts.includes("chinese")).length, 6);
  assert.ok(FONT_REGISTRY.every((font) => font.source !== "system" && font.license === "OFL-1.1"));
});

test("v2 migrates without moving artwork and retains old font identity", () => {
  const v3 = emptyProject();
  const oldText = { id: "old-text", faceId: "front", type: "text", name: "文字", x: 12, y: 18,
    width: 45, height: 12, rotation: 0, opacity: 1, visible: true, locked: false,
    text: "旧字", fontFamily: "PingFang SC", fontSizePt: 18, fontWeight: "bold", fontStyle: "normal",
    color: "#000000", textAlign: "left" };
  const v2 = { version: 2, templateId: "snap-lock-90x90x235", selectedFace: "front",
    faces: { ...v3.faces, front: [oldText] }, assets: v3.assets };
  const migrated = migrateProjectV2(v2);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.faces.front[0].x, 12);
  assert.equal(migrated.faces.front[0].fontId, "legacy-pingfang");
  assert.equal(migrated.faces.front[0].fontWeight, 700);
  assert.equal(runPreflight(migrated).find((issue) => issue.code === "UNAVAILABLE_FONT")?.level, "error");
  assert.equal(v2.faces.front[0].fontFamily, "PingFang SC");
  assert.equal(validateProjectV3({ ...migrated, faces: { ...migrated.faces, front: [{ ...migrated.faces.front[0], width: null }] } }), false);
});

test("preflight marks 200–299 DPI as warning and under 200 as strong warning", () => {
  const project = emptyProject();
  for (const [id, width, pixels] of [["good", 25.4, 300], ["warn", 25.4, 250], ["low", 25.4, 150]]) {
    project.assets[id] = { id, name: id, mime: "image/png", source: "upload", naturalWidth: pixels, naturalHeight: pixels };
    project.faces.front.push({ id, type: "asset", faceId: "front", name: id, assetId: id, x: 5, y: 5,
      width, height: 25.4, rotation: 0, opacity: 1, visible: true, locked: false });
  }
  const issues = runPreflight(project, new Set(["good", "warn", "low"]));
  assert.equal(issues.filter((issue) => issue.code === "MEDIUM_DPI").length, 1);
  assert.equal(issues.filter((issue) => issue.code === "LOW_DPI").length, 1);
  assert.ok(!issues.some((issue) => issue.objectId === "good" && issue.code.includes("DPI")));
  assert.equal(runPreflight(project, new Set()).filter((issue) => issue.code === "MISSING_ASSET").length, 3);
});
