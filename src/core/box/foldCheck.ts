import { Quaternion, Vector3 } from "three";
import { sampleContour } from "./geometry";
import type { CustomNetResult, CustomRegion } from "./custom";

type FoldedPanel = { region: CustomRegion; polygon: Vector3[]; holes: Vector3[][]; normal: Vector3;
  min: Vector3; max: Vector3 };
const epsilon = .2;

function pointInside(point: Vector3, polygon: Vector3[], normal: Vector3): boolean {
  const drop = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? "x"
    : Math.abs(normal.y) > Math.abs(normal.z) ? "y" : "z";
  const xy = (v: Vector3): [number, number] => drop === "x" ? [v.y, v.z] : drop === "y" ? [v.x, v.z] : [v.x, v.y];
  const [px, py] = xy(point);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = xy(polygon[i]), [bx, by] = xy(polygon[j]);
    if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function crosses(a: FoldedPanel, b: FoldedPanel): boolean {
  const base = b.polygon[0];
  for (let index = 0; index < a.polygon.length; index++) {
    const p = a.polygon[index], q = a.polygon[(index + 1) % a.polygon.length];
    const d1 = b.normal.dot(p.clone().sub(base)), d2 = b.normal.dot(q.clone().sub(base));
    if (d1 * d2 >= -epsilon * epsilon || Math.abs(d1 - d2) < epsilon) continue;
    const t = d1 / (d1 - d2);
    if (t < .01 || t > .99) continue;
    const at = p.clone().lerp(q, t);
    if (!pointInside(at, b.polygon, b.normal)) continue;
    if (b.holes.some((hole) => pointInside(at, hole, b.normal))) continue;
    return true;
  }
  return false;
}

function insideAwayFromEdges(point: Vector3, panel: FoldedPanel): boolean {
  if (!pointInside(point, panel.polygon, panel.normal) ||
      panel.holes.some((hole) => pointInside(point, hole, panel.normal))) return false;
  return panel.polygon.every((a, index) => {
    const b = panel.polygon[(index + 1) % panel.polygon.length];
    const edge = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(edge) / Math.max(edge.lengthSq(), 1e-9)));
    return point.distanceTo(a.clone().addScaledVector(edge, t)) > .4;
  });
}

function planeInteriorOverlap(a: FoldedPanel, b: FoldedPanel): boolean {
  const direction = a.normal.clone().cross(b.normal);
  const length2 = direction.lengthSq();
  if (length2 < 1e-8) return false;
  const d1 = a.normal.dot(a.polygon[0]), d2 = b.normal.dot(b.polygon[0]);
  const origin = b.normal.clone().multiplyScalar(d1).sub(a.normal.clone().multiplyScalar(d2))
    .cross(direction).divideScalar(length2);
  direction.normalize();
  const range = (panel: FoldedPanel) => panel.polygon.reduce(([low, high], point) => {
    const t = point.clone().sub(origin).dot(direction);
    return [Math.min(low, t), Math.max(high, t)];
  }, [Infinity, -Infinity]);
  const [aLow, aHigh] = range(a), [bLow, bHigh] = range(b);
  const low = Math.max(aLow, bLow), high = Math.min(aHigh, bHigh);
  if (high - low < 1) return false;
  for (let i = 1; i < 24; i++) {
    const point = origin.clone().addScaledVector(direction, low + (high - low) * i / 24);
    if (insideAwayFromEdges(point, a) && insideAwayFromEdges(point, b)) return true;
  }
  return false;
}

/** Detect nonadjacent paper panels passing through each other at 100% fold. Coplanar layers may overlap. */
export function foldedNetConflicts(result: CustomNetResult): string[] {
  const { regions, geometry } = result;
  const root = regions.find((region) => region.id === geometry.rootPanelId);
  if (!root || !geometry.hinges || geometry.hinges.length !== regions.length - 1) return [];
  const folded: FoldedPanel[] = [];
  const visit = (region: CustomRegion, origin: { x: number; y: number }, position: Vector3, rotation: Quaternion) => {
    const transform = (point: { x: number; y: number }) => new Vector3(point.x - origin.x, origin.y - point.y, 0)
      .applyQuaternion(rotation).add(position);
    const polygon = region.points.map(transform);
    const holes = region.holes.map((path) => sampleContour(path, 1).map(transform));
    const normal = new Vector3(0, 0, 1).applyQuaternion(rotation);
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    polygon.forEach((point) => { min.min(point); max.max(point); });
    folded.push({ region, polygon, holes, normal, min, max });
    for (const hinge of geometry.hinges!.filter((item) => item.parentId === region.id)) {
      const child = regions.find((item) => item.id === hinge.childId);
      if (!child) continue;
      const middle = { x: (hinge.x1 + hinge.x2) / 2, y: (hinge.y1 + hinge.y2) / 2 };
      const pivot = transform(middle);
      const axis = new Vector3(hinge.x2 - hinge.x1, -(hinge.y2 - hinge.y1), 0).normalize();
      const angle = (hinge.direction === "mountain" ? 1 : -1) * hinge.angleDeg * Math.PI / 180;
      const nextRotation = rotation.clone().multiply(new Quaternion().setFromAxisAngle(axis, angle));
      visit(child, middle, pivot, nextRotation);
    }
  };
  visit(root, { x: root.x + root.width / 2, y: root.y + root.height / 2 }, new Vector3(), new Quaternion());
  const adjacent = new Set(geometry.hinges.map((hinge) => [hinge.parentId, hinge.childId].sort().join("|")));
  const conflicts: string[] = [];
  for (let i = 0; i < folded.length; i++) for (let j = i + 1; j < folded.length; j++) {
    const a = folded[i], b = folded[j];
    if (adjacent.has([a.region.id, b.region.id].sort().join("|"))) continue;
    if (a.max.x < b.min.x - epsilon || b.max.x < a.min.x - epsilon ||
        a.max.y < b.min.y - epsilon || b.max.y < a.min.y - epsilon ||
        a.max.z < b.min.z - epsilon || b.max.z < a.min.z - epsilon) continue;
    if (Math.abs(a.normal.dot(b.normal)) > .999) continue;
    if (crosses(a, b) || crosses(b, a) || planeInteriorOverlap(a, b))
      conflicts.push(`${a.region.label} 与 ${b.region.label} 在合盒状态相互穿透。`);
    if (conflicts.length >= 12) return conflicts;
  }
  return conflicts;
}
