import { EndType, FillRule, JoinType, areaD, differenceD, inflatePathsD, intersectD, unionD } from "clipper2-ts";
import { svgPathProperties } from "svg-path-properties";

export const SNAP_LOCK_TEMPLATE_ID = "snap-lock-carton" as const;
export type BoxTemplateId = typeof SNAP_LOCK_TEMPLATE_ID;
export type PanelId = "left" | "back" | "right" | "front" | "top" | (string & {});
export type PointMm = { x: number; y: number };
export type BoxDimensions = { widthMm: number; depthMm: number; heightMm: number; glueFlapMm: number };
export type PanelGeometry = { id: PanelId; label: string; x: number; y: number; width: number; height: number;
  path?: string; holes?: string[]; printable?: boolean };
export type CreaseSegment = { id: string; type: "crease"; x1: number; y1: number; x2: number; y2: number };
export type CutContour = { id: string; type: "cut"; path: string; closed?: boolean };
export type HingeGeometry = { id: string; parentId: string; childId: string; x1: number; y1: number; x2: number; y2: number;
  angleDeg: number; direction: "mountain" | "valley"; start: number; end: number; layer: number };
export type FlapGeometry = {
  id: string;
  parent: PanelId | "glue";
  x: number; y: number; width: number; depth: number;
  path: string;
};
export type BoundsMm = { x: number; y: number; width: number; height: number };
export type BoxGeometry = {
  templateId: BoxTemplateId | "custom";
  dimensions: BoxDimensions;
  panels: PanelGeometry[];
  flaps: FlapGeometry[];
  cut: CutContour[];
  creases: CreaseSegment[];
  outerFaces: readonly string[];
  bounds: BoundsMm;
  viewBox: string;
  perimeter: string;
  backHole: string;
  holes?: string[];
  rootPanelId?: string;
  hinges?: HingeGeometry[];
  bodyTop: number;
  bodyBottom: number;
};

export type BoxTemplateDefinition = {
  id: BoxTemplateId;
  name: string;
  defaultDimensions: BoxDimensions;
  validateDimensions: (dimensions: BoxDimensions) => string[];
  generateGeometry: (dimensions: BoxDimensions) => BoxGeometry;
};

export const DEFAULT_DIMENSIONS: BoxDimensions = Object.freeze({
  widthMm: 90, depthMm: 90, heightMm: 235, glueFlapMm: 15,
});

const round = (value: number) => Number(value.toFixed(4));
const at = (value: number) => String(round(value));

export function validateDimensions(d: BoxDimensions): string[] {
  const errors: string[] = [];
  for (const [name, value, min, max] of [
    ["宽度", d.widthMm, 40, 200], ["深度", d.depthMm, 40, 200],
    ["高度", d.heightMm, 80, 400], ["糊口", d.glueFlapMm, 5, 30],
  ] as const) {
    if (!Number.isFinite(value) || value < min || value > max) errors.push(`${name}须在 ${min}–${max} mm 之间。`);
  }
  if (Number.isFinite(d.widthMm) && Number.isFinite(d.depthMm)) {
    const ratio = d.widthMm / d.depthMm;
    if (ratio < .5 || ratio > 2) errors.push("宽深比例须在 1:2 至 2:1 之间。");
    if (d.glueFlapMm > Math.min(d.widthMm, d.depthMm) / 3) errors.push("糊口不能超过较小侧宽的三分之一。");
  }
  return errors;
}

function crease(id: string, x1: number, y1: number, x2: number, y2: number): CreaseSegment {
  return { id, type: "crease", x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) };
}

export function generateSnapLockGeometry(d: BoxDimensions): BoxGeometry {
  const errors = validateDimensions(d);
  if (errors.length) throw new Error(errors.join(" "));
  const W = d.widthMm, D = d.depthMm, H = d.heightMm, G = d.glueFlapMm;
  const x0 = G, x1 = x0 + D, x2 = x1 + W, x3 = x2 + D, x4 = x3 + W;
  const y0 = 4 * D / 3, y1 = y0 + H;
  const topY = y0 - D;
  const dust = D * 31 / 90;
  const tuck = D * 34 / 90;
  const bottom = D * 47 / 90;
  const sideBottom = W * 47 / 90;
  const r = (x: number, a: number, width: number) => x + width * a / 90;
  const y = (a: number) => y1 + D * a / 90;
  const sideY = (a: number) => y1 + W * a / 90;

  const panels: PanelGeometry[] = [
    { id: "left", label: "左侧", x: x0, y: y0, width: D, height: H },
    { id: "back", label: "背面", x: x1, y: y0, width: W, height: H },
    { id: "right", label: "右侧", x: x2, y: y0, width: D, height: H },
    { id: "front", label: "正面", x: x3, y: y0, width: W, height: H },
    { id: "top", label: "顶面", x: x3, y: topY, width: W, height: D },
  ];

  // Every feature is attached to its own panel. The 90 mm reference ratios
  // calibrate the unlabelled flap contours without scaling the full net.
  const outer = [
    `M${at(x0)} ${at(y0)} L${at(G * 7 / 15)} ${at(y0 + .5 * G / 15)} Q${at(G * 3 / 15)} ${at(y0 + G / 15)} 0 ${at(y0 + 4 * G / 15)} L0 ${at(y1 - 8 * G / 15)} Q${at(4 * G / 15)} ${at(y1)} ${at(x0)} ${at(y1)}`,
    `L${at(x0)} ${at(sideY(45))} Q${at(x0)} ${at(sideY(47))} ${at(r(x0, 2, D))} ${at(sideY(47))} H${at(r(x0, 20, D))} Q${at(r(x0, 21, D))} ${at(sideY(47))} ${at(r(x0, 21, D))} ${at(sideY(45))} V${at(sideY(31))} H${at(r(x0, 69, D))} V${at(sideY(45))} Q${at(r(x0, 69, D))} ${at(sideY(47))} ${at(r(x0, 71, D))} ${at(sideY(47))} H${at(r(x0, 88, D))} Q${at(x1)} ${at(sideY(47))} ${at(x1)} ${at(sideY(45))} V${at(y1)}`,
    `L${at(r(x1, 31, W))} ${at(y(32))} V${at(y(45))} Q${at(r(x1, 31, W))} ${at(y(47))} ${at(r(x1, 33, W))} ${at(y(47))} H${at(r(x1, 88, W))} Q${at(x2)} ${at(y(47))} ${at(x2)} ${at(y(45))} V${at(y1)}`,
    `L${at(r(x2, 23, D))} ${at(sideY(33))} V${at(sideY(45))} Q${at(r(x2, 23, D))} ${at(sideY(47))} ${at(r(x2, 25, D))} ${at(sideY(47))} H${at(r(x2, 68, D))} Q${at(r(x2, 70, D))} ${at(sideY(47))} ${at(r(x2, 70, D))} ${at(sideY(45))} V${at(sideY(33))} L${at(x3)} ${at(y1)}`,
    `L${at(r(x3, 33, W))} ${at(y(33))} V${at(y(45))} Q${at(r(x3, 33, W))} ${at(y(47))} ${at(r(x3, 35, W))} ${at(y(47))} H${at(r(x3, 88, W))} Q${at(x4)} ${at(y(47))} ${at(x4)} ${at(y(45))} V${at(y1)}`,
    `L${at(x4)} ${at(y0)} L${at(x4)} ${at(topY + 5 * D / 90)} Q${at(x4)} ${at(topY + D / 90)} ${at(r(x3, 87, W))} ${at(topY)} L${at(r(x3, 88, W))} ${at(topY - 3 * D / 90)} V${at(topY - 21 * D / 90)} Q${at(r(x3, 88, W))} ${at(topY - tuck)} ${at(r(x3, 75, W))} ${at(topY - tuck)} H${at(r(x3, 56, W))} V${at(topY - 33 * D / 90)} A${at(W * 11 / 90)} ${at(W * 11 / 90)} 0 0 1 ${at(r(x3, 34, W))} ${at(topY - 33 * D / 90)} V${at(topY - tuck)} H${at(r(x3, 15, W))} Q${at(r(x3, 2, W))} ${at(topY - tuck)} ${at(r(x3, 2, W))} ${at(topY - 21 * D / 90)} V${at(topY - 3 * D / 90)} L${at(x3)} ${at(topY)} L${at(x3)} ${at(y0)}`,
    `L${at(x3 - D * 15 / 90)} ${at(y0 - dust)} H${at(x2 + D * 15 / 90)} L${at(x2)} ${at(y0)} L${at(x2)} ${at(y0 - D * 110 / 90)} H${at(x1)} V${at(y0)} L${at(x1 - D * 15 / 90)} ${at(y0 - dust)} H${at(x0 + D * 15 / 90)} L${at(x0)} ${at(y0)} Z`,
  ].join(" ");
  const holeCenterX = x1 + W / 2;
  const holeCenterY = y0 - D * 49 / 90;
  const holeRadius = Math.min(W, D) * 14 / 90;
  const backHole = `M${at(holeCenterX + holeRadius)} ${at(holeCenterY)} A${at(holeRadius)} ${at(holeRadius)} 0 1 0 ${at(holeCenterX - holeRadius)} ${at(holeCenterY)} A${at(holeRadius)} ${at(holeRadius)} 0 1 0 ${at(holeCenterX + holeRadius)} ${at(holeCenterY)} Z`;

  const creases = [
    crease("glue", x0, y0, x0, y1), crease("left-back", x1, y0, x1, y1),
    crease("back-right", x2, y0, x2, y1), crease("right-front", x3, y0, x3, y1),
    crease("top-left", x0, y0, x1, y0), crease("top-back", x1, y0, x2, y0),
    crease("top-right", x2, y0, x3, y0), crease("top-front", x3, y0, x4, y0),
    crease("bottom-left", x0, y1, x1, y1), crease("bottom-back", x1, y1, x2, y1),
    crease("bottom-right", x2, y1, x3, y1), crease("bottom-front", x3, y1, x4, y1),
    crease("back-crease-1", x1, y0 - D * 85 / 90, x2, y0 - D * 85 / 90),
    crease("back-crease-2", x1, y0 - D * 18 / 90, x2, y0 - D * 18 / 90),
    crease("tuck", x3, topY, x4, topY),
  ];
  const fx = (width: number, v: number) => at(width * v / 90);
  const fy = (v: number) => at(D * v / 90);
  const sideFy = (v: number) => at(W * v / 90);
  const flaps: FlapGeometry[] = [
    { id: "glue", parent: "glue", x: 0, y: y0, width: G, depth: H,
      path: `M${at(G)} 0 L${at(7 * G / 15)} ${at(.5 * G / 15)} Q${at(3 * G / 15)} ${at(G / 15)} 0 ${at(4 * G / 15)} V${at(H - 8 * G / 15)} Q${at(4 * G / 15)} ${at(H)} ${at(G)} ${at(H)} Z` },
    { id: "dust-left", parent: "left", x: x0, y: y0 - dust, width: D, depth: dust, path: `M0 ${at(dust)} L${at(D / 6)} 0 H${at(D * 5 / 6)} L${at(D)} ${at(dust)} Z` },
    { id: "back-closure", parent: "back", x: x1, y: y0 - D * 110 / 90, width: W, depth: D * 110 / 90, path: `M0 0 H${at(W)} V${at(D * 110 / 90)} H0 Z` },
    { id: "dust-right", parent: "right", x: x2, y: y0 - dust, width: D, depth: dust, path: `M0 ${at(dust)} L${at(D / 6)} 0 H${at(D * 5 / 6)} L${at(D)} ${at(dust)} Z` },
    { id: "tuck", parent: "top", x: x3, y: topY - tuck, width: W, depth: tuck,
      path: `M0 ${fy(34)} L${fx(W, 2)} ${fy(31)} V${fy(13)} Q${fx(W, 2)} 0 ${fx(W, 15)} 0 H${fx(W, 34)} V${fy(1)} A${fx(W, 11)} ${fy(11)} 0 0 0 ${fx(W, 56)} ${fy(1)} V0 H${fx(W, 75)} Q${fx(W, 88)} 0 ${fx(W, 88)} ${fy(13)} V${fy(31)} L${at(W)} ${fy(34)} Z` },
    { id: "bottom-left", parent: "left", x: x0, y: y1, width: D, depth: sideBottom,
      path: `M0 0 H${at(D)} V${sideFy(45)} Q${at(D)} ${sideFy(47)} ${fx(D, 88)} ${sideFy(47)} H${fx(D, 71)} Q${fx(D, 69)} ${sideFy(47)} ${fx(D, 69)} ${sideFy(45)} V${sideFy(31)} H${fx(D, 21)} V${sideFy(45)} Q${fx(D, 21)} ${sideFy(47)} ${fx(D, 19)} ${sideFy(47)} H${fx(D, 2)} Q0 ${sideFy(47)} 0 ${sideFy(45)} Z` },
    { id: "bottom-back", parent: "back", x: x1, y: y1, width: W, depth: bottom,
      path: `M0 0 H${at(W)} L${fx(W, 88)} ${fy(47)} H${fx(W, 33)} Q${fx(W, 31)} ${fy(47)} ${fx(W, 31)} ${fy(45)} V${fy(32)} Z` },
    { id: "bottom-right", parent: "right", x: x2, y: y1, width: D, depth: sideBottom,
      path: `M0 0 H${at(D)} L${fx(D, 68)} ${sideFy(32)} V${sideFy(45)} Q${fx(D, 68)} ${sideFy(47)} ${fx(D, 66)} ${sideFy(47)} H${fx(D, 24)} Q${fx(D, 22)} ${sideFy(47)} ${fx(D, 22)} ${sideFy(45)} V${sideFy(32)} Z` },
    { id: "bottom-front", parent: "front", x: x3, y: y1, width: W, depth: bottom,
      path: `M0 0 H${at(W)} V${fy(45)} Q${at(W)} ${fy(47)} ${fx(W, 88)} ${fy(47)} H${fx(W, 34)} Q${fx(W, 32)} ${fy(47)} ${fx(W, 32)} ${fy(45)} V${fy(32)} Z` },
  ];
  const minY = topY - tuck;
  const bounds = { x: 0, y: round(minY), width: round(x4), height: round(y1 + Math.max(bottom, sideBottom) - minY) };
  return {
    templateId: SNAP_LOCK_TEMPLATE_ID, dimensions: { ...d }, panels, flaps,
    cut: [{ id: "outer", type: "cut", path: outer }, { id: "back-hole", type: "cut", path: backHole }],
    creases, outerFaces: ["front", "back", "left", "right", "top", "bottom"],
    bounds, viewBox: `${at(-18)} ${at(minY - 15)} ${at(x4 + 36)} ${at(bounds.height + 37)}`,
    perimeter: outer, backHole, bodyTop: round(y0), bodyBottom: round(y1),
  };
}

export const BOX_TEMPLATES: Record<BoxTemplateId, BoxTemplateDefinition> = {
  [SNAP_LOCK_TEMPLATE_ID]: {
    id: SNAP_LOCK_TEMPLATE_ID, name: "插接式锁底盒",
    defaultDimensions: DEFAULT_DIMENSIONS,
    validateDimensions, generateGeometry: generateSnapLockGeometry,
  },
};

export function generateGeometry(templateId: BoxTemplateId, dimensions: BoxDimensions): BoxGeometry {
  return BOX_TEMPLATES[templateId].generateGeometry(dimensions);
}

export function faceSizeForGeometry(geometry: BoxGeometry, face: PanelId | "bottom") {
  const panel = geometry.panels.find((item) => item.id === face);
  if (panel) return { width: panel.width, height: panel.height };
  return { width: geometry.dimensions.widthMm, height: geometry.dimensions.depthMm };
}

export function sampleContour(path: string, stepMm = .25): PointMm[] {
  const properties = new svgPathProperties(path);
  const length = properties.getTotalLength();
  const count = Math.max(4, Math.ceil(length / stepMm));
  const points: PointMm[] = [];
  for (let index = 0; index < count; index++) {
    const point = properties.getPointAtLength(length * index / count);
    if (!points.length || Math.hypot(points.at(-1)!.x - point.x, points.at(-1)!.y - point.y) > 1e-5) {
      points.push({ x: round(point.x), y: round(point.y) });
    }
  }
  return points;
}

function offsetContour(points: PointMm[], distanceMm: number): PointMm[] {
  const solution = inflatePathsD([points], distanceMm, JoinType.Round, EndType.Polygon, 2, 3, .05);
  if (!solution.length) return [];
  return solution.reduce((largest, path) => path.length > largest.length ? path : largest, solution[0])
    .map((point) => ({ x: round(point.x), y: round(point.y) }));
}

export function guideContours(geometry: BoxGeometry, distanceMm: number, kind: "bleed" | "safe") {
  const sourceHoles = geometry.holes ?? (geometry.backHole ? [geometry.backHole] : []);
  if (distanceMm <= 0) return { outer: sampleContour(geometry.perimeter),
    hole: sourceHoles[0] ? sampleContour(sourceHoles[0]) : [], holes: sourceHoles.map((path) => sampleContour(path)) };
  const outer = sampleContour(geometry.perimeter);
  const sign = kind === "bleed" ? 1 : -1;
  const holes = sourceHoles.map((path) => offsetContour(sampleContour(path), -sign * distanceMm));
  return { outer: offsetContour(outer, sign * distanceMm), hole: holes[0] ?? [], holes };
}

export function contourBounds(points: PointMm[]): BoundsMm {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function polygonIntersectsPolygon(a: PointMm[], b: PointMm[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  return intersectD([a], [b], FillRule.NonZero).some((path) => path.length >= 3);
}

export function closedBottomGapArea(geometry: BoxGeometry): number {
  if (geometry.templateId !== SNAP_LOCK_TEMPLATE_ID) return 0;
  const W = geometry.dimensions.widthMm, D = geometry.dimensions.depthMm;
  const shapes = (["bottom-front", "bottom-back", "bottom-left", "bottom-right"] as const).map((id) => {
    const flap = geometry.flaps.find((item) => item.id === id);
    if (!flap) return [];
    return sampleContour(flap.path, .25).map((point) => id === "bottom-front"
      ? { x: point.x, y: D - point.y } : id === "bottom-back"
        ? { x: W - point.x, y: point.y } : id === "bottom-left"
          ? { x: W - point.y, y: D - point.x } : { x: point.y, y: point.x });
  }).filter((points) => points.length >= 3);
  const footprint = unionD(shapes, FillRule.NonZero);
  const uncovered = differenceD([[{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }]],
    footprint, FillRule.NonZero, 4);
  return uncovered.reduce((total, path) => total + Math.abs(areaD(path)), 0);
}

export function geometryIntegrityIssues(geometry: BoxGeometry): string[] {
  const issues: string[] = [];
  const points = sampleContour(geometry.perimeter, 1.5);
  const cross = (a: PointMm, b: PointMm, c: PointMm) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let a = 0; a < points.length && !issues.length; a++) {
    const b = (a + 1) % points.length;
    for (let c = a + 2; c < points.length; c++) {
      const d = (c + 1) % points.length;
      if (a === d || b === c) continue;
      const p = points[a], q = points[b], r = points[c], s = points[d];
      if (cross(p, q, r) * cross(p, q, s) < -1e-7 && cross(r, s, p) * cross(r, s, q) < -1e-7) {
        issues.push("刀板外轮廓发生自交。"); break;
      }
    }
  }
  for (let a = 0; a < geometry.flaps.length; a++) {
    for (let b = a + 1; b < geometry.flaps.length; b++) {
      const left = geometry.flaps[a], right = geometry.flaps[b];
      const overlapX = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
      const overlapY = Math.min(left.y + left.depth, right.y + right.depth) - Math.max(left.y, right.y);
      if (overlapX > .05 && overlapY > .05) issues.push(`折片 ${left.id} 与 ${right.id} 发生重叠。`);
    }
  }
  return issues;
}
