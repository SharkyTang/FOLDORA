import { generateGeometry, geometryIntegrityIssues, validateDimensions } from "../box/geometry";
import { getFont } from "../fonts/registry";
import { EDITABLE_FACES, FACE_LABELS, effectiveDpi, faceSize, type EditableFaceId, type Project } from "../project/types";

export type PreflightLevel = "error" | "warning" | "strong-warning";
export type PreflightIssue = {
  code: string;
  level: PreflightLevel;
  message: string;
  faceId?: EditableFaceId;
  objectId?: string;
};

function rotatedBounds(x: number, y: number, width: number, height: number, rotation: number) {
  const radians = rotation * Math.PI / 180;
  const c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  const boxWidth = width * c + height * s, boxHeight = width * s + height * c;
  return { left: x + width / 2 - boxWidth / 2, right: x + width / 2 + boxWidth / 2,
    top: y + height / 2 - boxHeight / 2, bottom: y + height / 2 + boxHeight / 2 };
}

export function runPreflight(project: Project, availableAssetIds?: ReadonlySet<string>): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const dimensionErrors = validateDimensions(project.dimensions);
  if (dimensionErrors.length) {
    issues.push({ code: "INVALID_DIMENSIONS", level: "error", message: dimensionErrors.join(" ") });
    return issues;
  }
  try {
    const geometry = generateGeometry(project.templateId, project.dimensions);
    if (!geometry.perimeter || !geometry.backHole || geometry.creases.length < 12)
      issues.push({ code: "INVALID_GEOMETRY", level: "error", message: "刀板轮廓或压痕数据不完整。" });
    for (const message of geometryIntegrityIssues(geometry))
      issues.push({ code: "GEOMETRY_CONFLICT", level: "error", message });
  } catch (error) {
    issues.push({ code: "INVALID_GEOMETRY", level: "error", message: error instanceof Error ? error.message : "刀板生成失败。" });
  }
  if (!Number.isFinite(project.print.bleedMm) || project.print.bleedMm < 0 || project.print.bleedMm > 10)
    issues.push({ code: "INVALID_BLEED", level: "error", message: "出血须在 0–10 mm 之间。" });
  else if (project.print.bleedMm < 3)
    issues.push({ code: "LOW_BLEED", level: "warning", message: `出血 ${project.print.bleedMm} mm，建议至少 3 mm。` });
  if (!Number.isFinite(project.print.safeAreaMm) || project.print.safeAreaMm < 0 || project.print.safeAreaMm > 20)
    issues.push({ code: "INVALID_SAFE_AREA", level: "error", message: "安全距离须在 0–20 mm 之间。" });
  else if (project.print.safeAreaMm < 3)
    issues.push({ code: "LOW_SAFE_AREA", level: "warning", message: `安全距离 ${project.print.safeAreaMm} mm，建议至少 3 mm。` });

  for (const faceId of EDITABLE_FACES) {
    const size = faceSize(faceId, project);
    for (const object of project.faces[faceId]) {
      if (!object.visible) continue;
      const where = `${FACE_LABELS[faceId]}「${object.name}」`;
      if (![object.x, object.y, object.width, object.height, object.rotation].every(Number.isFinite) || object.width <= 0 || object.height <= 0) {
        issues.push({ code: "INVALID_OBJECT", level: "error", message: `${where}的位置或尺寸无效。`, faceId, objectId: object.id });
        continue;
      }
      const b = rotatedBounds(object.x, object.y, object.width, object.height, object.rotation);
      if (b.left < 0 || b.top < 0 || b.right > size.width || b.bottom > size.height)
        issues.push({ code: "OUT_OF_BOUNDS", level: "warning", message: `${where}超出盒面边界；更新尺寸不会自动缩放图案。`, faceId, objectId: object.id });
      else if (b.left < project.print.safeAreaMm || b.top < project.print.safeAreaMm ||
        b.right > size.width - project.print.safeAreaMm || b.bottom > size.height - project.print.safeAreaMm)
        issues.push({ code: "INSIDE_SAFE_AREA", level: "warning", message: `${where}进入安全距离。`, faceId, objectId: object.id });
      if (object.type === "text") {
        const font = getFont(object.fontId);
        if (!font || font.legacy)
          issues.push({ code: "UNAVAILABLE_FONT", level: "error", message: `${where}使用未注册或旧版系统字体，请选择字体库中的字体。`, faceId, objectId: object.id });
        else if (!font.weights.includes(object.fontWeight))
          issues.push({ code: "UNAVAILABLE_FONT_WEIGHT", level: "error", message: `${where}的字重不可用。`, faceId, objectId: object.id });
        else if (object.fontStyle === "italic" && !font.italic)
          issues.push({ code: "UNAVAILABLE_FONT_STYLE", level: "error", message: `${where}的斜体不可用。`, faceId, objectId: object.id });
      } else {
        const asset = project.assets[object.assetId];
        if (!asset || (availableAssetIds && !availableAssetIds.has(object.assetId))) {
          issues.push({ code: "MISSING_ASSET", level: "error", message: `${where}缺少图片素材。`, faceId, objectId: object.id });
          continue;
        }
        if (asset.mime === "image/svg+xml") continue;
        const dpi = Math.min(effectiveDpi(asset.naturalWidth, object.width), effectiveDpi(asset.naturalHeight, object.height));
        if (dpi < 200) issues.push({ code: "LOW_DPI", level: "strong-warning", message: `${where}有效分辨率约 ${Math.round(dpi)} DPI，低于 200 DPI。`, faceId, objectId: object.id });
        else if (dpi < 300) issues.push({ code: "MEDIUM_DPI", level: "warning", message: `${where}有效分辨率约 ${Math.round(dpi)} DPI，建议至少 300 DPI。`, faceId, objectId: object.id });
      }
    }
  }
  return issues;
}
