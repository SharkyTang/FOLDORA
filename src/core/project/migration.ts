import { DEFAULT_DIMENSIONS, SNAP_LOCK_TEMPLATE_ID, validateDimensions } from "../box/geometry";
import { legacyFontId } from "../fonts/registry";
import { BUILTIN_ASSETS, EDITABLE_FACES, type DesignObject, type EditableFaceId, type FaceId, type Project, type ProjectV2,
  type ProjectV3, type TextObject } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const faceIds = [...EDITABLE_FACES, "bottom"] as const;
const named = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;

function validCustomNet(value: unknown): boolean {
  if (!isRecord(value) || typeof value.outer !== "string" || value.outer.length > 200_000 ||
      !Array.isArray(value.holes) || (value.cutLines !== undefined && !Array.isArray(value.cutLines)) ||
      !Array.isArray(value.creases) || !Array.isArray(value.guides) ||
      !Array.isArray(value.markers) || !(value.rootPanelId === null || typeof value.rootPanelId === "string") ||
      value.holes.length > 500 || (value.cutLines?.length ?? 0) > 1000 || value.creases.length > 1000 ||
      value.guides.length > 1000 || value.markers.length > 1000) return false;
  const pathsValid = (items: unknown[]) => items.every((item) => isRecord(item) && named(item.id) &&
    typeof item.path === "string" && item.path.length <= 200_000);
  if (!pathsValid(value.holes) || !pathsValid(value.cutLines ?? []) || !pathsValid(value.guides)) return false;
  if (!value.creases.every((item) => isRecord(item) && named(item.id) &&
      [item.x1, item.y1, item.x2, item.y2, item.angleDeg, item.start, item.end, item.layer].every(finite) &&
      ["mountain", "valley"].includes(String(item.direction)) && typeof item.confirmed === "boolean" &&
      (item.curvePath === undefined || typeof item.curvePath === "string"))) return false;
  if (!value.markers.every((item) => isRecord(item) && named(item.id) && typeof item.name === "string" &&
      finite(item.x) && finite(item.y) && typeof item.printable === "boolean" && typeof item.confirmed === "boolean")) return false;
  const ids = [...value.holes, ...(value.cutLines ?? []), ...value.creases, ...value.guides, ...value.markers].map((item) => item.id);
  return new Set(ids).size === ids.length;
}

function validAssets(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((asset) => isRecord(asset) &&
    typeof asset.id === "string" && typeof asset.name === "string" && typeof asset.mime === "string" &&
    (asset.source === "builtin" || asset.source === "upload") && finite(asset.naturalWidth) && finite(asset.naturalHeight));
}

function validObject(value: unknown, version: 2 | 3): boolean {
  if (!isRecord(value) || typeof value.id !== "string" || !(EDITABLE_FACES as readonly string[]).includes(value.faceId as EditableFaceId) ||
      typeof value.name !== "string" || ![value.x, value.y, value.width, value.height, value.rotation, value.opacity].every(finite) ||
      typeof value.visible !== "boolean" || typeof value.locked !== "boolean") return false;
  if (value.type === "asset") return typeof value.assetId === "string";
  if (value.type !== "text" || typeof value.text !== "string" || !finite(value.fontSizePt) ||
      typeof value.color !== "string" || !["left", "center", "right"].includes(String(value.textAlign)) ||
      !["normal", "italic"].includes(String(value.fontStyle))) return false;
  return version === 2 ? typeof value.fontFamily === "string" && ["normal", "bold"].includes(String(value.fontWeight))
    : typeof value.fontId === "string" && finite(value.fontWeight) && finite(value.letterSpacingMm) && finite(value.lineHeight);
}

function validFaces(value: unknown, version: 2 | 3): boolean {
  return isRecord(value) && faceIds.every((face) => Array.isArray(value[face]) &&
    (value[face] as unknown[]).every((object) => validObject(object, version)));
}

export function validateProjectV2(value: unknown): value is ProjectV2 {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ProjectV2>;
  if (project.version !== 2 || project.templateId !== "snap-lock-90x90x235") return false;
  if (!(EDITABLE_FACES as readonly string[]).includes(project.selectedFace as EditableFaceId)) return false;
  return validFaces(project.faces, 2) && validAssets(project.assets);
}

export function migrateProjectV2(project: ProjectV2): ProjectV3 {
  if (!validateProjectV2(project)) throw new Error("旧项目结构不完整，未执行迁移。");
  const faces = {} as Record<FaceId, DesignObject[]>;
  for (const face of [...EDITABLE_FACES, "bottom"] as const) {
    faces[face] = (project.faces[face] ?? []).map((object) => {
      if (object.type !== "text") return { ...object };
      const { fontFamily, fontWeight, ...rest } = object;
      return {
        ...rest,
        fontId: legacyFontId(fontFamily) ?? `legacy-unknown:${fontFamily}`,
        fontWeight: fontWeight === "bold" ? 700 : 400,
        letterSpacingMm: 0,
        lineHeight: 1.2,
      } satisfies TextObject;
    });
  }
  return {
    version: 3,
    templateId: SNAP_LOCK_TEMPLATE_ID,
    dimensions: { ...DEFAULT_DIMENSIONS },
    print: { bleedMm: 3, safeAreaMm: 3 },
    selectedFace: project.selectedFace,
    faces,
    assets: { ...BUILTIN_ASSETS, ...project.assets },
  };
}

export function validateProjectV3(value: unknown): value is ProjectV3 {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ProjectV3>;
  if (project.version !== 3 || project.templateId !== SNAP_LOCK_TEMPLATE_ID || !project.dimensions || !project.print || !project.faces || !project.assets) return false;
  if (!(EDITABLE_FACES as readonly string[]).includes(project.selectedFace as EditableFaceId)) return false;
  if (validateDimensions(project.dimensions).length || !finite(project.print.bleedMm) || !finite(project.print.safeAreaMm) ||
      project.print.bleedMm < 0 || project.print.bleedMm > 10 || project.print.safeAreaMm < 0 || project.print.safeAreaMm > 20) return false;
  return validFaces(project.faces, 3) && validAssets(project.assets);
}

export function migrateProjectV3(project: ProjectV3): Project {
  if (!validateProjectV3(project)) throw new Error("v0.2 项目结构不完整，未执行迁移。");
  return { ...structuredClone(project), version: 4, id: crypto.randomUUID(), name: "未命名包装设计",
    mode: "template", templateRevision: 2 };
}

export function validateProjectV4(value: unknown): value is Project {
  if (!isRecord(value) || value.version !== 4 || !named(value.id) ||
      typeof value.name !== "string" || (value.mode !== "template" && value.mode !== "custom") ||
      value.templateRevision !== 2 ||
      value.templateId !== SNAP_LOCK_TEMPLATE_ID || !isRecord(value.dimensions) || !isRecord(value.print) ||
      !isRecord(value.faces) || !validAssets(value.assets) || typeof value.selectedFace !== "string") return false;
  if (value.mode === "template" && validateDimensions(value.dimensions as Project["dimensions"]).length) return false;
  if (value.mode === "custom" && !validCustomNet(value.customNet)) return false;
  if (!finite(value.print.bleedMm) || !finite(value.print.safeAreaMm) ||
      value.print.bleedMm < 0 || value.print.bleedMm > 10 || value.print.safeAreaMm < 0 || value.print.safeAreaMm > 20) return false;
  return Object.entries(value.faces).every(([faceId, objects]) => Array.isArray(objects) && objects.every((object) => {
    if (!isRecord(object) || typeof object.faceId !== "string" || typeof object.id !== "string") return false;
    if (object.faceId !== faceId) return false;
    if ((value.mode === "template") && !(EDITABLE_FACES as readonly string[]).includes(object.faceId)) return false;
    return typeof object.name === "string" && [object.x, object.y, object.width, object.height,
      object.rotation, object.opacity].every(finite) && typeof object.visible === "boolean" && typeof object.locked === "boolean" &&
      (object.type === "asset" ? typeof object.assetId === "string" : object.type === "text" &&
        typeof object.text === "string" && typeof object.fontId === "string" && finite(object.fontSizePt) &&
        finite(object.fontWeight) && finite(object.letterSpacingMm) && finite(object.lineHeight));
  }));
}
