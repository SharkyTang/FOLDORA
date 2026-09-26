import { PDFDocument, rgb } from "pdf-lib";
import { guideContours, sampleContour, contourBounds, type BoundsMm, type PointMm } from "../box/geometry";
import { geometryForProject } from "../box/resolve";
import { ensureFontLoaded } from "../fonts/loader";
import { projectFaceIds, mmToPixels, mmToPt, type EditableFaceId, type Project } from "../project/types";
import { runPreflight } from "./preflight";

export type ExportSettings = {
  format: "pdf";
  dpi: 150 | 300;
  includeBleed: boolean;
  includeCut: boolean;
  includeCrease: boolean;
};

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: "pdf", dpi: 300, includeBleed: true, includeCut: true, includeCrease: true,
};

type FaceRenderer = (face: EditableFaceId, dpi: 150 | 300) => Promise<HTMLCanvasElement>;

const toSvgPath = (points: PointMm[], closed = true) => points.length
  ? `M ${points.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" L ")}${closed ? " Z" : ""}` : "";

function drawContour(page: ReturnType<PDFDocument["addPage"]>, points: PointMm[], bounds: BoundsMm,
  color: ReturnType<typeof rgb>, widthPt: number, dash?: number[], closed = true) {
  if (!points.length) return;
  page.drawSvgPath(toSvgPath(points, closed), {
    x: -mmToPt(bounds.x), y: mmToPt(bounds.height + bounds.y), scale: mmToPt(1),
    borderColor: color, borderWidth: widthPt, borderDashArray: dash,
  });
}

function imagePngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => canvas.toBlob(async (blob) => {
    if (!blob) { reject(new Error("盒面合成失败。")); return; }
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, "image/png"));
}

export async function buildProofPdf(project: Project, settings: ExportSettings,
  renderFace: FaceRenderer, availableAssetIds?: ReadonlySet<string>): Promise<Uint8Array> {
  if (settings.format !== "pdf" || ![150, 300].includes(settings.dpi)) throw new Error("PDF 导出设置无效。 ");
  const errors = runPreflight(project, availableAssetIds).filter((issue) => issue.level === "error");
  if (errors.length) throw new Error(`PDF 导出已阻止：${errors[0].message}`);
  const geometry = geometryForProject(project);
  const bleed = settings.includeBleed ? guideContours(geometry, project.print.bleedMm, "bleed") : null;
  const contentBounds = bleed ? contourBounds(bleed.outer) : geometry.bounds;
  const marginMm = 2;
  const bounds = { x: contentBounds.x - marginMm, y: contentBounds.y - marginMm,
    width: contentBounds.width + 2 * marginMm, height: contentBounds.height + 2 * marginMm };
  const pageWidth = mmToPt(bounds.width), pageHeight = mmToPt(bounds.height);
  // A net this large exceeds both practical print proof needs and most browser canvas budgets.
  if (pageWidth > 14400 || pageHeight > 14400) throw new Error("PDF 页面超过 200 英寸限制。 ");
  const totalPixels = geometry.panels.reduce((sum, panel) => sum + Math.ceil(mmToPixels(panel.width, settings.dpi)) *
    Math.ceil(mmToPixels(panel.height, settings.dpi)), 0);
  if (totalPixels > 80_000_000) throw new Error("刀板超过 8000 万像素预算，请使用 150 DPI 草稿导出。 ");

  const fontJobs = projectFaceIds(project).flatMap((face) => (project.faces[face] ?? [])
    .filter((item) => item.type === "text" && item.visible)
    .map((item) => item.type === "text" ? ensureFontLoaded(item.fontId, item.text, item.fontWeight, item.fontStyle === "italic") : Promise.resolve()));
  await Promise.all(fontJobs);
  if (typeof requestAnimationFrame !== "undefined") await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const pdf = await PDFDocument.create();
  pdf.setTitle("FOLDORA RGB 校样刀板");
  pdf.setSubject(`${project.name} · ${settings.dpi} DPI RGB proof`);
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
  for (const panel of geometry.panels) {
    const canvas = await renderFace(panel.id, settings.dpi);
    const image = await pdf.embedPng(await imagePngBytes(canvas));
    page.drawImage(image, { x: mmToPt(panel.x - bounds.x),
      y: pageHeight - mmToPt(panel.y - bounds.y + panel.height),
      width: mmToPt(panel.width), height: mmToPt(panel.height) });
  }
  if (bleed) {
    drawContour(page, bleed.outer, bounds, rgb(.79, .29, .20), .45, [2, 2]);
    for (const hole of bleed.holes) drawContour(page, hole, bounds, rgb(.79, .29, .20), .45, [2, 2]);
  }
  if (settings.includeCut) {
    drawContour(page, sampleContour(geometry.perimeter, .5), bounds, rgb(.02, .55, .32), .6);
    for (const hole of geometry.holes ?? (geometry.backHole ? [geometry.backHole] : []))
      drawContour(page, sampleContour(hole, .25), bounds, rgb(.02, .55, .32), .6);
    for (const cut of geometry.cut.filter((item) => item.closed === false))
      drawContour(page, sampleContour(cut.path, .5), bounds, rgb(.02, .55, .32), .6, undefined, false);
  }
  if (settings.includeCrease) {
    for (const crease of geometry.creases) page.drawLine({
      start: { x: mmToPt(crease.x1 - bounds.x), y: pageHeight - mmToPt(crease.y1 - bounds.y) },
      end: { x: mmToPt(crease.x2 - bounds.x), y: pageHeight - mmToPt(crease.y2 - bounds.y) },
      color: rgb(.12, .39, .72), thickness: .45, dashArray: [4, 2],
    });
  }
  return pdf.save({ useObjectStreams: false });
}
