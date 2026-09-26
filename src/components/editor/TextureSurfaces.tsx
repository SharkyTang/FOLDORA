"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type Konva from "konva";
import { useProjectStore } from "@/core/project/store";
import { EDITABLE_FACES, faceSize, mmToPixels, type EditableFaceId } from "@/core/project/types";
import { FaceStage } from "./FaceStage";

export type SurfaceMap = Partial<Record<EditableFaceId, HTMLCanvasElement>>;
export type PreviewMap = Partial<Record<EditableFaceId, string>>;
export type SurfaceHandle = {
  exportFace: (face: EditableFaceId, format: "png" | "jpeg") => string;
  renderPrintFace: (face: EditableFaceId, dpi: 150 | 300) => Promise<HTMLCanvasElement>;
};

type Props = {
  assetUrls: Record<string, string>;
  onSurfaces: (canvases: SurfaceMap, previews: PreviewMap) => void;
  onAssetError: (message: string) => void;
};

const SURFACE_SCALE = 4;

export const TextureSurfaces = forwardRef<SurfaceHandle, Props>(function TextureSurfaces({ assetUrls, onSurfaces, onAssetError }, forwardedRef) {
  const project = useProjectStore((state) => state.project);
  const refs = useRef<Record<EditableFaceId, React.RefObject<Konva.Stage | null>>>(
    Object.fromEntries(EDITABLE_FACES.map((face) => [face, { current: null }])) as Record<EditableFaceId, React.RefObject<Konva.Stage | null>>,
  );
  const frame = useRef<number | null>(null);
  const force = useRef(true);
  const signatures = useRef<Partial<Record<EditableFaceId, string>>>({});
  const canvases = useRef<SurfaceMap>({});
  const previews = useRef<PreviewMap>({});

  const schedule = useCallback((rebuildAll = false) => {
    if (rebuildAll) force.current = true;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const latest = useProjectStore.getState().project;
      let changed = false;
      const nextCanvases = { ...canvases.current };
      const nextPreviews = { ...previews.current };
      for (const face of EDITABLE_FACES) {
        const stage = refs.current[face].current;
        if (!stage) continue;
        const signature = JSON.stringify([latest.faces[face], faceSize(face, latest)]);
        if (!force.current && signatures.current[face] === signature) continue;
        const canvas = stage.toCanvas({ pixelRatio: 1 });
        nextCanvases[face] = canvas;
        nextPreviews[face] = canvas.toDataURL("image/png");
        signatures.current[face] = signature;
        changed = true;
      }
      force.current = false;
      if (changed) {
        canvases.current = nextCanvases;
        previews.current = nextPreviews;
        onSurfaces(nextCanvases, nextPreviews);
      }
    });
  }, [onSurfaces]);
  const onReady = useCallback(() => schedule(true), [schedule]);

  useEffect(() => { schedule(); }, [project, assetUrls, schedule]);
  useEffect(() => () => { if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; } }, []);
  useImperativeHandle(forwardedRef, () => ({
    exportFace(face, format) {
      const stage = refs.current[face].current;
      if (!stage) throw new Error("画布仍在加载，请稍后重试。");
      const targetWidth = 1200;
      const { width } = faceSize(face, useProjectStore.getState().project);
      return stage.toDataURL({
        mimeType: format === "png" ? "image/png" : "image/jpeg",
        quality: format === "jpeg" ? 0.92 : undefined,
        pixelRatio: targetWidth / (width * SURFACE_SCALE),
      });
    },
    async renderPrintFace(face, dpi) {
      const project = useProjectStore.getState().project;
      const stage = refs.current[face].current;
      if (!stage) throw new Error("印刷画布仍在加载，请稍后重试。");
      const expected = project.faces[face].filter((item) => item.type === "asset" && item.visible).map((item) => item.id);
      const deadline = Date.now() + 12000;
      while (!expected.every((id) => stage.find("Image").some((node) => node.id() === id))) {
        if (Date.now() > deadline) throw new Error(`${face} 的图片仍未加载，请检查素材。`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      stage.draw();
      const { width, height } = faceSize(face, project);
      const pixels = Math.ceil(mmToPixels(width, dpi)) * Math.ceil(mmToPixels(height, dpi));
      if (pixels > 25_000_000) throw new Error("单个盒面超过 2500 万像素预算，请使用 150 DPI 草稿导出。");
      return stage.toCanvas({ pixelRatio: mmToPixels(width, dpi) / (width * SURFACE_SCALE) });
    },
  }), []);

  return <div className="offscreen-surfaces" aria-hidden="true">
    {EDITABLE_FACES.map((face) => <FaceStage key={face} faceId={face} pixelsPerMm={SURFACE_SCALE}
      assetUrls={assetUrls} stageRef={refs.current[face]} onAssetReady={onReady} onFontReady={onReady} onAssetError={onAssetError} />)}
  </div>;
});
