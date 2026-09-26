import assert from "node:assert/strict";
import test from "node:test";
import { customNetFromTemplate, deriveCustomNet, confirmCustomRegions, emptyCustomNet } from "../src/core/box/custom.ts";
import { editablePath, pathWithHandles } from "../src/core/box/pathEdit.ts";
import { DEFAULT_DIMENSIONS, closedBottomGapArea, generateGeometry } from "../src/core/box/geometry.ts";
import { validateProjectV4 } from "../src/core/project/migration.ts";
import { emptyProject } from "../src/core/project/types.ts";

test("template copy resolves 16 connected panels and preserves corrected bottom coverage", () => {
  const net = customNetFromTemplate(DEFAULT_DIMENSIONS);
  const result = deriveCustomNet(net);
  assert.equal(result.regions.length, 16);
  assert.equal(result.geometry.hinges.length, 15);
  assert.deepEqual(result.issues, []);
  assert.match(net.outer, /H373 Q375 402 375 400 V355/);
  assert.ok(closedBottomGapArea(generateGeometry("snap-lock-carton", DEFAULT_DIMENSIONS)) < .02);
});

test("blank rectangle is a saveable draft, then becomes a two-panel foldable net", () => {
  const net = { ...emptyCustomNet(), outer: "M0 0 H200 V100 H0 Z", creases: [{ id: "fold", x1: 100, y1: 0,
    x2: 100, y2: 100, direction: "mountain", angleDeg: 90, start: 0, end: 100, layer: 0, confirmed: false }] };
  assert.ok(deriveCustomNet(net).issues.length);
  const confirmed = confirmCustomRegions(net);
  const result = deriveCustomNet(confirmed);
  assert.deepEqual(result.issues, []);
  assert.equal(result.regions.length, 2);
  assert.equal(result.geometry.hinges.length, 1);
  const broken = { ...confirmed, holes: [{ id: "outside", path: "M190 10 H210 V30 H190 Z" }] };
  assert.ok(deriveCustomNet(broken).issues.some((issue) => issue.includes("超出外轮廓")));
  const openCut = { ...confirmed, cutLines: [{ id: "slit", path: "M20 20 L30 20" }] };
  const withOpenCut = deriveCustomNet(openCut);
  assert.deepEqual(withOpenCut.issues, []);
  assert.equal(withOpenCut.geometry.cut.find((cut) => cut.id === "slit").closed, false);
  assert.deepEqual(withOpenCut.regions.find((region) => region.cutLines.length)?.cutLines, ["M20 20 L30 20"]);
});

test("path node and Bezier control editing preserves untouched curves and arcs", () => {
  const source = "M0 0 Q10 20 30 0 L40 0 A10 10 0 0 1 50 10 H0 Z";
  const model = editablePath(source);
  const positions = model.handles.map(({ x, y }) => ({ x, y }));
  assert.ok(model.handles.some((handle) => handle.kind === "control"));
  positions[1].y = 25;
  const updated = pathWithHandles(model, positions);
  assert.match(updated, /Q 10 25 30 0/);
  assert.match(updated, /A 10 10 0 0 1 50 10/);
  assert.match(updated, /L 0 10 Z$/);
});

test("closed fold rejects two nonadjacent panels crossing through one another", () => {
  const net = emptyCustomNet();
  net.outer = "M-100 0 H0 V-100 H100 V100 H-100 Z";
  net.creases = [
    { id: "left", x1: 0, y1: 0, x2: 0, y2: 100, direction: "mountain", angleDeg: 135,
      start: 0, end: 100, layer: 0, confirmed: true },
    { id: "top", x1: 0, y1: 0, x2: 100, y2: 0, direction: "valley", angleDeg: 135,
      start: 0, end: 100, layer: 1, confirmed: true },
  ];
  const confirmed = confirmCustomRegions(net);
  confirmed.rootPanelId = confirmed.markers.find((marker) => marker.x > 0 && marker.y > 0).id;
  assert.ok(deriveCustomNet(confirmed).issues.some((issue) => issue.includes("合盒状态相互穿透")));
});

test("v4 validation rejects corrupt custom records without replacing projects", () => {
  const project = emptyProject();
  project.mode = "custom";
  project.customNet = emptyCustomNet();
  project.faces = {};
  project.selectedFace = "";
  assert.equal(validateProjectV4(project), true);
  assert.equal(validateProjectV4({ ...project, customNet: { ...project.customNet, creases: [{ id: "bad" }] } }), false);
});
