import assert from "node:assert/strict";
import test from "node:test";
import { useProjectStore } from "../src/core/project/store.ts";
import { BUILTIN_ASSETS, emptyProject, ptToMm } from "../src/core/project/types.ts";

test("scene graph stores artwork in millimetres and one ordered list per face", () => {
  const store = useProjectStore;
  store.getState().loadProject(emptyProject());
  store.getState().addText();
  const text = store.getState().project.faces.front[0];
  assert.equal(text.type, "text");
  assert.equal(text.faceId, "front");
  assert.equal(text.width, 64);
  assert.ok(ptToMm(text.fontSizePt) > 0);
  store.getState().addAssetObject(BUILTIN_ASSETS.badge);
  assert.deepEqual(store.getState().project.faces.front.map((item) => item.type), ["text", "asset"]);
  const image = store.getState().project.faces.front[1];
  store.getState().reorderObject(image.id, "bottom");
  assert.deepEqual(store.getState().project.faces.front.map((item) => item.type), ["asset", "text"]);
  store.getState().undo();
  assert.deepEqual(store.getState().project.faces.front.map((item) => item.type), ["text", "asset"]);
  store.getState().redo();
  assert.deepEqual(store.getState().project.faces.front.map((item) => item.type), ["asset", "text"]);
  store.getState().setFace("right");
  assert.equal(store.getState().project.faces.right.length, 0);
  assert.equal(store.getState().project.faces.front.length, 2);
});
