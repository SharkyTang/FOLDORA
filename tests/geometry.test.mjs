import assert from "node:assert/strict";
import test from "node:test";
import { DIECUT } from "../src/core/box/reference.ts";
import { EDITABLE_FACES, emptyProject, faceSize } from "../src/core/project/types.ts";

test("参考图的四块主体按左、背、右、前排列，顶盖接正面", () => {
  const sides = DIECUT.panels.filter((panel) => panel.id !== "top");
  assert.deepEqual(sides.map((panel) => panel.id), ["left", "back", "right", "front"]);
  for (const [index, panel] of sides.entries()) {
    assert.equal(panel.x, 15 + 90 * index);
    assert.equal(panel.y, DIECUT.bodyTop);
    assert.equal(panel.width, 90);
    assert.equal(panel.height, 235);
  }
  const top = DIECUT.panels.find((panel) => panel.id === "top");
  assert.deepEqual([top.x, top.y, top.width, top.height], [285, 30, 90, 90]);
  assert.equal(DIECUT.dimensions.glue, 15);
});

test("合盒仅有六个外表面，底部由四种不同锁片构成", () => {
  assert.deepEqual(DIECUT.outerFaces, ["front", "back", "left", "right", "top", "bottom"]);
  assert.equal(DIECUT.panels.length, 5);
  const bottoms = ["bottomLeft", "bottomBack", "bottomRight", "bottomFront"].map((key) => DIECUT.flapPaths[key]);
  assert.equal(new Set(bottoms).size, 4);
  for (const path of bottoms) {
    assert.match(path, /^M0 0 H90/);
    assert.match(path, /47/);
  }
  assert.deepEqual(EDITABLE_FACES, ["front", "back", "left", "right", "top"]);
  assert.deepEqual(Object.keys(emptyProject().faces), ["front", "back", "left", "right", "top", "bottom"]);
  assert.deepEqual(faceSize("front"), { width: 90, height: 235 });
  assert.deepEqual(faceSize("top"), { width: 90, height: 90 });
  for (const key of ["bottomLeft", "bottomBack", "bottomRight", "bottomFront"]) {
    assert.ok(DIECUT.flapPaths[key]);
  }
});

test("糊口、盒身、上下翼及背面上片的折线都有明确位置", () => {
  const creases = Object.fromEntries(DIECUT.creases.map((crease) => [crease.id, crease]));
  assert.deepEqual([creases.glue.x1, creases.glue.y1, creases.glue.y2], [15, 120, 355]);
  assert.deepEqual([creases["left-back"].x1, creases["back-right"].x1, creases["right-front"].x1], [105, 195, 285]);
  assert.deepEqual([creases["top-front"].y1, creases["bottom-front"].y1, creases.tuck.y1], [120, 355, 30]);
  assert.deepEqual([creases["back-crease-1"].y1, creases["back-crease-2"].y1], [35, 102]);
  assert.match(DIECUT.backHole, /A14 14/);
});
