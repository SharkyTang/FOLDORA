import { DEFAULT_DIMENSIONS, SNAP_LOCK_TEMPLATE_ID, type BoxDimensions } from "../box/geometry";
import { deriveCustomNet, type CustomNet } from "../box/custom";

export const EDITABLE_FACES = ["front", "back", "left", "right", "top"] as const;
export type EditableFaceId = string;
export type FaceId = string;

export const FACE_LABELS: Record<string, string> = {
  front: "正面", back: "背面", left: "左侧", right: "右侧", top: "顶面", bottom: "底面",
};

export type BaseObject = {
  id: string;
  faceId: EditableFaceId;
  name: string;
  x: number; y: number; width: number; height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
};

export type TextObject = BaseObject & {
  type: "text";
  text: string;
  fontId: string;
  fontSizePt: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  color: string;
  textAlign: "left" | "center" | "right";
  letterSpacingMm: number;
  lineHeight: number;
};

export type AssetObject = BaseObject & {
  type: "asset";
  assetId: string;
};

export type DesignObject = TextObject | AssetObject;

export type AssetMeta = {
  id: string;
  name: string;
  mime: "image/png" | "image/jpeg" | "image/svg+xml";
  source: "builtin" | "upload";
  path?: string;
  naturalWidth: number;
  naturalHeight: number;
};

export type ProjectV3 = {
  version: 3;
  templateId: typeof SNAP_LOCK_TEMPLATE_ID;
  dimensions: BoxDimensions;
  print: { bleedMm: number; safeAreaMm: number };
  selectedFace: EditableFaceId;
  faces: Record<FaceId, DesignObject[]>;
  assets: Record<string, AssetMeta>;
};

export type Project = {
  version: 4;
  id: string;
  name: string;
  mode: "template" | "custom";
  templateRevision: 2;
  templateId: typeof SNAP_LOCK_TEMPLATE_ID;
  dimensions: BoxDimensions;
  customNet?: CustomNet;
  print: { bleedMm: number; safeAreaMm: number };
  selectedFace: EditableFaceId;
  faces: Record<string, DesignObject[]>;
  assets: Record<string, AssetMeta>;
};

export type TextObjectV2 = Omit<TextObject, "fontId" | "fontWeight" | "letterSpacingMm" | "lineHeight"> & {
  fontFamily: string;
  fontWeight: "normal" | "bold";
};
export type DesignObjectV2 = TextObjectV2 | AssetObject;
export type ProjectV2 = {
  version: 2;
  templateId: "snap-lock-90x90x235";
  selectedFace: EditableFaceId;
  faces: Record<FaceId, DesignObjectV2[]>;
  assets: Record<string, AssetMeta>;
};

export const BUILTIN_ASSETS: Record<string, AssetMeta> = {
  badge: { id: "badge", name: "纪念徽章", mime: "image/svg+xml", source: "builtin", path: "/assets/badge.svg", naturalWidth: 240, naturalHeight: 240 },
  frame: { id: "frame", name: "装饰边框", mime: "image/svg+xml", source: "builtin", path: "/assets/frame.svg", naturalWidth: 300, naturalHeight: 440 },
  leaf: { id: "leaf", name: "植物纹样", mime: "image/svg+xml", source: "builtin", path: "/assets/leaf.svg", naturalWidth: 230, naturalHeight: 330 },
  monogram: { id: "monogram", name: "字母标记", mime: "image/svg+xml", source: "builtin", path: "/assets/monogram.svg", naturalWidth: 240, naturalHeight: 240 },
};

export function emptyProject(): Project {
  return {
    version: 4,
    id: crypto.randomUUID(),
    name: "未命名包装设计",
    mode: "template",
    templateRevision: 2,
    templateId: SNAP_LOCK_TEMPLATE_ID,
    dimensions: { ...DEFAULT_DIMENSIONS },
    print: { bleedMm: 3, safeAreaMm: 3 },
    selectedFace: "front",
    faces: { front: [], back: [], left: [], right: [], top: [], bottom: [] },
    assets: { ...BUILTIN_ASSETS },
  };
}

export function projectFaceIds(project: Project): EditableFaceId[] {
  return project.mode === "custom" && project.customNet
    ? deriveCustomNet(project.customNet).regions.filter((region) => region.printable && region.confirmed).map((region) => region.id)
    : [...EDITABLE_FACES];
}

export function faceLabel(project: Project, face: FaceId): string {
  if (project.mode === "custom" && project.customNet)
    return deriveCustomNet(project.customNet).regions.find((region) => region.id === face)?.label ?? face;
  return FACE_LABELS[face] ?? face;
}

export function faceSize(face: FaceId, project?: Pick<Project, "dimensions" | "mode" | "customNet"> | Pick<ProjectV3, "dimensions">): { width: number; height: number } {
  if (project && "mode" in project && project.mode === "custom" && project.customNet) {
    const region = deriveCustomNet(project.customNet).regions.find((item) => item.id === face);
    if (region) return { width: region.width, height: region.height };
  }
  const dimensions = project?.dimensions ?? DEFAULT_DIMENSIONS;
  if (face === "top" || face === "bottom") return { width: dimensions.widthMm, height: dimensions.depthMm };
  return { width: face === "front" || face === "back" ? dimensions.widthMm : dimensions.depthMm,
    height: dimensions.heightMm };
}

export function mmToCanvasPx(mm: number, pixelsPerMm: number): number { return mm * pixelsPerMm; }
export function canvasPxToMm(px: number, pixelsPerMm: number): number { return px / pixelsPerMm; }
export function ptToMm(pt: number): number { return pt * 25.4 / 72; }
export function mmToPixels(mm: number, dpi: number): number { return mm / 25.4 * dpi; }
export function pixelsToMm(pixels: number, dpi: number): number { return pixels / dpi * 25.4; }
export function mmToPt(mm: number): number { return mm / 25.4 * 72; }
export function effectiveDpi(pixels: number, millimetres: number): number {
  return pixels / (millimetres / 25.4);
}

export function objectLabel(object: DesignObject): string {
  return object.type === "text" ? object.text.trim().slice(0, 24) || "空白文字" : object.name;
}
