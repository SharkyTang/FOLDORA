import { FillRule, intersectD } from "clipper2-ts";
import { contourBounds, generateSnapLockGeometry, sampleContour, type BoxDimensions, type BoxGeometry,
  type HingeGeometry, type PointMm } from "./geometry";
import { foldedNetConflicts } from "./foldCheck";

export type CustomCrease = {
  id: string; x1: number; y1: number; x2: number; y2: number;
  direction: "mountain" | "valley"; angleDeg: number; start: number; end: number; layer: number;
  confirmed: boolean; curvePath?: string;
};
export type PanelMarker = { id: string; name: string; x: number; y: number; printable: boolean; confirmed: boolean };
export type CustomNet = {
  outer: string;
  holes: { id: string; path: string }[];
  cutLines?: { id: string; path: string }[];
  creases: CustomCrease[];
  guides: { id: string; path: string }[];
  markers: PanelMarker[];
  rootPanelId: string | null;
};
export type CustomRegion = { id: string; label: string; points: PointMm[]; path: string;
  x: number; y: number; width: number; height: number; printable: boolean; confirmed: boolean;
  holes: string[]; cutLines: string[] };
export type CustomNetResult = { geometry: BoxGeometry; regions: CustomRegion[]; issues: string[] };
const derivedCache = new WeakMap<CustomNet, CustomNetResult>();

export const emptyCustomNet = (): CustomNet => ({ outer: "", holes: [], cutLines: [], creases: [], guides: [], markers: [], rootPanelId: null });
const round = (value: number) => Number(value.toFixed(4));
const area = (points: PointMm[]) => Math.abs(points.reduce((total, p, index) => {
  const q = points[(index + 1) % points.length];
  return total + p.x * q.y - q.x * p.y;
}, 0)) / 2;
const pathOf = (points: PointMm[]) => points.length
  ? `M${points.map((p) => `${round(p.x)} ${round(p.y)}`).join(" L")} Z` : "";
const inside = (point: PointMm, polygon: PointMm[]) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};
const segmentDistance = (p: PointMm, a: PointMm, b: PointMm) => {
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
};
const onBoundary = (point: PointMm, polygon: PointMm[]) => polygon.some((p, i) =>
  segmentDistance(point, p, polygon[(i + 1) % polygon.length]) < .35);
const cross = (a: PointMm, b: PointMm, c: PointMm) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function selfIntersects(points: PointMm[]): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if (cross(a, b, c) * cross(a, b, d) < -1e-7 && cross(c, d, a) * cross(c, d, b) < -1e-7)
        return true;
    }
  }
  return false;
}

function splitRegion(points: PointMm[], crease: CustomCrease, extent: number): PointMm[][] {
  const a = { x: crease.x1, y: crease.y1 }, b = { x: crease.x2, y: crease.y2 };
  if (!onBoundary(a, points) || !onBoundary(b, points)) return [points];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < .1) return [points];
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  const nx = -uy, ny = ux;
  const before = { x: a.x - ux * extent, y: a.y - uy * extent };
  const after = { x: b.x + ux * extent, y: b.y + uy * extent };
  const sides = [1, -1].flatMap((sign) => {
    const half = [before, after,
      { x: after.x + nx * extent * sign, y: after.y + ny * extent * sign },
      { x: before.x + nx * extent * sign, y: before.y + ny * extent * sign }];
    return intersectD([points], [half], FillRule.NonZero, 4).filter((poly) => area(poly) > .02)
      .map((poly) => poly.map((p) => ({ x: round(p.x), y: round(p.y) })));
  });
  return sides.length >= 2 && Math.abs(sides.reduce((sum, side) => sum + area(side), 0) - area(points)) < .5
    ? sides : [points];
}

function seedIn(points: PointMm[]): PointMm {
  const box = contourBounds(points);
  for (let rows = 1; rows <= 20; rows++) {
    for (let y = 0; y < rows; y++) for (let x = 0; x < rows; x++) {
      const candidate = { x: box.x + (x + .5) * box.width / rows, y: box.y + (y + .5) * box.height / rows };
      if (inside(candidate, points)) return candidate;
    }
  }
  return points[0];
}

export function deriveCustomNet(net: CustomNet): CustomNetResult {
  const cached = derivedCache.get(net);
  if (cached) return cached;
  const issues: string[] = [];
  let outer: PointMm[] = [];
  if (!net.outer.trim().toUpperCase().endsWith("Z")) issues.push("外轮廓尚未闭合。");
  try { if (net.outer) outer = sampleContour(net.outer, .4); }
  catch { issues.push("外轮廓路径无法读取。"); }
  if (outer.length < 3 || area(outer) < 1) issues.push("请绘制面积大于 1 mm² 的外轮廓。");
  else if (selfIntersects(outer)) issues.push("外轮廓发生自交。");
  const holePolygons: { id: string; points: PointMm[] }[] = [];
  for (const hole of net.holes) {
    try {
      if (!hole.path.trim().toUpperCase().endsWith("Z")) { issues.push(`开孔 ${hole.id} 尚未闭合。`); continue; }
      const points = sampleContour(hole.path, .4);
      if (points.length < 3 || area(points) < .1 || selfIntersects(points)) {
        issues.push(`开孔 ${hole.id} 面积无效或发生自交。`); continue;
      }
      const overlap = outer.length >= 3 ? intersectD([points], [outer], FillRule.NonZero, 4)
        .reduce((sum, part) => sum + area(part), 0) : 0;
      if (area(points) - overlap > .05) issues.push(`开孔 ${hole.id} 超出外轮廓。`);
      for (const previous of holePolygons) if (intersectD([points], [previous.points], FillRule.NonZero, 4)
        .some((part) => area(part) > .02)) issues.push(`开孔 ${hole.id} 与 ${previous.id} 重叠。`);
      holePolygons.push({ id: hole.id, points });
    } catch { issues.push(`开孔 ${hole.id} 路径无效。`); }
  }
  for (const cut of net.cutLines ?? []) {
    try {
      const points = sampleContour(cut.path, .5);
      if (points.length < 2 || cut.path.trim().toUpperCase().endsWith("Z") ||
          points.some((point) => (!inside(point, outer) && !onBoundary(point, outer)) ||
            holePolygons.some((hole) => inside(point, hole.points))))
        issues.push(`开放刀线 ${cut.id} 无效或超出纸板轮廓。`);
    } catch { issues.push(`开放刀线 ${cut.id} 路径无效。`); }
  }
  const outerBounds = outer.length ? contourBounds(outer) : { x: 0, y: 0, width: 100, height: 100 };
  const extent = Math.max(outerBounds.width, outerBounds.height, 100) * 20;
  let polygons = outer.length >= 3 ? [outer] : [];
  for (const crease of net.creases) {
    if (crease.curvePath) { issues.push(`压痕 ${crease.id} 为曲线，3D 需要直线铰链。`); continue; }
    if (![crease.x1, crease.y1, crease.x2, crease.y2, crease.angleDeg, crease.start, crease.end].every(Number.isFinite)
        || crease.angleDeg < 0 || crease.angleDeg > 180 || crease.start < 0 || crease.end > 100 || crease.start >= crease.end) {
      issues.push(`压痕 ${crease.id} 的位置、角度或时间无效。`); continue;
    }
    const next = polygons.flatMap((polygon) => splitRegion(polygon, crease, extent));
    if (next.length === polygons.length) issues.push(`压痕 ${crease.id} 未分隔两个面板，请检查端点是否吸附到边界。`);
    polygons = next;
  }
  const holeOwners = new Map<string, number>();
  for (const hole of holePolygons) {
    const owners = polygons.flatMap((polygon, index) => {
      const covered = intersectD([hole.points], [polygon], FillRule.NonZero, 4)
        .reduce((sum, part) => sum + area(part), 0);
      return Math.abs(covered - area(hole.points)) < .05 ? [index] : [];
    });
    if (owners.length !== 1) issues.push(`开孔 ${hole.id} 跨越压痕或未能归属单个面板。`);
    else holeOwners.set(hole.id, owners[0]);
  }
  const cutOwners = new Map<string, number>();
  for (const cut of net.cutLines ?? []) {
    try {
      const points = sampleContour(cut.path, .5);
      const owners = polygons.flatMap((polygon, index) => points.every((point) =>
        inside(point, polygon) || onBoundary(point, polygon)) ? [index] : []);
      if (owners.length !== 1) issues.push(`开放刀线 ${cut.id} 跨越压痕或无法归属单个面板。`);
      else cutOwners.set(cut.id, owners[0]);
    } catch { /* The invalid path was reported above. */ }
  }
  const regions: CustomRegion[] = polygons.map((points, index) => {
    const box = contourBounds(points);
    const matches = net.markers.filter((mark) => inside(mark, points) || onBoundary(mark, points));
    if (matches.length > 1) issues.push(`面板 ${index + 1} 有重复标记，请确认拆分或合并后的归属。`);
    if (!matches.length) issues.push(`面板 ${index + 1} 尚未确认名称和用途。`);
    const marker = matches[0];
    const regionHoles = net.holes.filter((hole) => holeOwners.get(hole.id) === index).map((hole) => hole.path);
    const regionCuts = (net.cutLines ?? []).filter((cut) => cutOwners.get(cut.id) === index).map((cut) => cut.path);
    return { id: marker?.id ?? `candidate-${index + 1}`, label: marker?.name ?? `待确认面板 ${index + 1}`,
      points, path: pathOf(points), x: box.x, y: box.y, width: box.width, height: box.height,
      printable: marker?.printable ?? true, confirmed: marker?.confirmed ?? false,
      holes: regionHoles, cutLines: regionCuts };
  });
  const usedMarkers = new Set(regions.map((region) => region.id));
  for (const marker of net.markers) if (!usedMarkers.has(marker.id)) issues.push(`面板「${marker.name}」的标记已离开结构，请重新定位。`);
  const adjacent = net.creases.flatMap((crease) => {
    const dx = crease.x2 - crease.x1, dy = crease.y2 - crease.y1, length = Math.hypot(dx, dy);
    if (length < .1) return [];
    const mid = { x: (crease.x1 + crease.x2) / 2, y: (crease.y1 + crease.y2) / 2 };
    const offset = { x: -dy / length * .2, y: dx / length * .2 };
    const a = regions.find((region) => inside({ x: mid.x + offset.x, y: mid.y + offset.y }, region.points));
    const b = regions.find((region) => inside({ x: mid.x - offset.x, y: mid.y - offset.y }, region.points));
    if (!a || !b || a.id === b.id) return [];
    if (!crease.confirmed) issues.push(`压痕 ${crease.id} 尚未确认折向与角度。`);
    return [{ crease, a: a.id, b: b.id }];
  });
  if (!net.rootPanelId || !regions.some((region) => region.id === net.rootPanelId)) issues.push("请选择 3D 基准面板。");
  const hinges: HingeGeometry[] = [];
  if (net.rootPanelId) {
    const seen = new Set([net.rootPanelId]);
    const queue = [net.rootPanelId];
    while (queue.length) {
      const parent = queue.shift()!;
      for (const link of adjacent.filter((item) => item.a === parent || item.b === parent)) {
        const child = link.a === parent ? link.b : link.a;
        if (seen.has(child)) continue;
        seen.add(child); queue.push(child);
        hinges.push({ id: link.crease.id, parentId: parent, childId: child,
          x1: link.crease.x1, y1: link.crease.y1, x2: link.crease.x2, y2: link.crease.y2,
          angleDeg: link.crease.angleDeg, direction: link.crease.direction,
          start: link.crease.start, end: link.crease.end, layer: link.crease.layer });
      }
    }
    if (seen.size !== regions.length || adjacent.length !== Math.max(0, regions.length - 1))
      issues.push("折线连接必须覆盖全部面板且不能形成闭环。");
  }
  const geometry: BoxGeometry = {
    templateId: "custom", dimensions: { widthMm: outerBounds.width, depthMm: outerBounds.height,
      heightMm: outerBounds.height, glueFlapMm: 0 },
    panels: regions.filter((region) => region.printable && region.confirmed).map((region) => ({ id: region.id, label: region.label,
      x: region.x, y: region.y, width: region.width, height: region.height, path: region.path, holes: region.holes, printable: true })),
    flaps: [], cut: [{ id: "outer", type: "cut", path: net.outer },
      ...net.holes.map((hole) => ({ id: hole.id, type: "cut" as const, path: hole.path })),
      ...(net.cutLines ?? []).map((line) => ({ id: line.id, type: "cut" as const, path: line.path, closed: false }))],
    creases: net.creases.map((crease) => ({ id: crease.id, type: "crease", x1: crease.x1, y1: crease.y1, x2: crease.x2, y2: crease.y2 })),
    outerFaces: regions.map((region) => region.id), bounds: outerBounds,
    viewBox: `${outerBounds.x - 18} ${outerBounds.y - 18} ${outerBounds.width + 36} ${outerBounds.height + 36}`,
    perimeter: net.outer, backHole: net.holes[0]?.path ?? "", holes: net.holes.map((hole) => hole.path),
    bodyTop: outerBounds.y, bodyBottom: outerBounds.y + outerBounds.height,
    rootPanelId: net.rootPanelId ?? undefined, hinges,
  };
  const result = { geometry, regions, issues };
  if (!issues.length) issues.push(...foldedNetConflicts(result));
  derivedCache.set(net, result);
  return result;
}

export function confirmCustomRegions(net: CustomNet): CustomNet {
  const result = deriveCustomNet(net);
  const markers = result.regions.map((region) => net.markers.find((mark) => mark.id === region.id)
    ?? { id: crypto.randomUUID(), name: region.label.replace("待确认面板", "面板"),
      ...seedIn(region.points), printable: true, confirmed: true });
  return { ...net, markers, rootPanelId: net.rootPanelId ?? markers[0]?.id ?? null,
    creases: net.creases.map((crease) => ({ ...crease, confirmed: true })) };
}

export function customNetFromTemplate(dimensions: BoxDimensions): CustomNet {
  const source = generateSnapLockGeometry(dimensions);
  const provisional: CustomNet = { outer: source.perimeter,
    holes: [{ id: "back-hole", path: source.backHole }],
    cutLines: [],
    creases: source.creases.map((line, index) => ({ ...line,
      x2: line.id === "tuck" ? line.x2 - dimensions.widthMm * 3 / 90 : line.x2,
      direction: line.id.startsWith("top-") || line.id === "tuck" || line.id.startsWith("back-crease")
        ? "valley" : "mountain",
      angleDeg: line.id === "back-crease-2" ? 0 : 90,
      start: line.id.startsWith("bottom-") ? 30 : line.id === "tuck" || line.id === "back-crease-1" ? 70
        : line.id.startsWith("top-") || line.id.startsWith("back-crease") ? 25 : Math.min(45, index * 4),
      end: 100, layer: index, confirmed: true })),
    guides: [], markers: [], rootPanelId: null };
  const regions = deriveCustomNet(provisional).regions;
  const markers = regions.map((region, index) => {
    const point = seedIn(region.points);
    const standard = source.panels.find((panel) => point.x >= panel.x && point.x <= panel.x + panel.width &&
      point.y >= panel.y && point.y <= panel.y + panel.height);
    return { id: standard?.id ?? `structural-${index + 1}`, name: standard?.label ?? `结构面 ${index + 1}`,
      ...point, printable: true, confirmed: true };
  });
  return { ...provisional, markers,
    rootPanelId: markers.find((marker) => marker.id === "front")?.id ?? markers[0]?.id ?? null };
}
