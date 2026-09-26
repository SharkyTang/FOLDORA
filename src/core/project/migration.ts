import { DEFAULT_DIMENSIONS, SNAP_LOCK_TEMPLATE_ID, validateDimensions } from "../box/geometry";
import { legacyFontId } from "../fonts/registry";
import { BUILTIN_ASSETS, EDITABLE_FACES, type DesignObject, type EditableFaceId, type FaceId, type Project, type ProjectV2, type TextObject } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const faceIds = [...EDITABLE_FACES, "bottom"] as const;

function validAssets(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((asset) => isRecord(asset) &&
    typeof asset.id === "string" && typeof asset.name === "string" && typeof asset.mime === "string" &&
    (asset.source === "builtin" || asset.source === "upload") && finite(asset.naturalWidth) && finite(asset.naturalHeight));
}

function validObject(value: unknown, version: 2 | 3): boolean {
  if (!isRecord(value) || typeof value.id !== "string" || !EDITABLE_FACES.includes(value.faceId as EditableFaceId) ||
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
  if (!EDITABLE_FACES.includes(project.selectedFace as EditableFaceId)) return false;
  return validFaces(project.faces, 2) && validAssets(project.assets);
}

export function migrateProjectV2(project: ProjectV2): Project {
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

export function validateProjectV3(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  if (project.version !== 3 || project.templateId !== SNAP_LOCK_TEMPLATE_ID || !project.dimensions || !project.print || !project.faces || !project.assets) return false;
  if (!EDITABLE_FACES.includes(project.selectedFace as EditableFaceId)) return false;
  if (validateDimensions(project.dimensions).length || !finite(project.print.bleedMm) || !finite(project.print.safeAreaMm) ||
      project.print.bleedMm < 0 || project.print.bleedMm > 10 || project.print.safeAreaMm < 0 || project.print.safeAreaMm > 20) return false;
  return validFaces(project.faces, 3) && validAssets(project.assets);
}
