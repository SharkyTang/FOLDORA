"use client";

import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { ensureFontLoaded } from "@/core/fonts/loader";
import { canvasFontFamily, getFont } from "@/core/fonts/registry";
import { useProjectStore } from "@/core/project/store";
import { faceSize, ptToMm, type AssetObject, type DesignObject, type EditableFaceId } from "@/core/project/types";

type Props = {
  faceId: EditableFaceId;
  pixelsPerMm: number;
  assetUrls: Record<string, string>;
  stageRef?: React.RefObject<Konva.Stage | null>;
  interactive?: boolean;
  onAssetReady?: () => void;
  onAssetError?: (message: string) => void;
  onFontReady?: () => void;
};

function useLoadedImage(src: string | undefined, onReady?: () => void, onError?: (message: string) => void) {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => { onReadyRef.current = onReady; onErrorRef.current = onError; }, [onReady, onError]);
  useEffect(() => {
    if (!src) return;
    let active = true;
    const element = new window.Image();
    element.onload = () => { if (active) { setLoaded({ src, image: element }); onReadyRef.current?.(); } };
    element.onerror = () => { if (active) { onErrorRef.current?.("素材图片无法读取，请重新上传或更换素材。"); } };
    element.src = src;
    return () => { active = false; };
  }, [src]);
  return loaded && loaded.src === src ? loaded.image : null;
}

function ArtworkObject({ object, pixelsPerMm: k, src, interactive, selected, onAssetReady, onAssetError, onFontReady }: {
  object: DesignObject; pixelsPerMm: number; src?: string; interactive: boolean; selected: boolean;
  onAssetReady?: () => void; onAssetError?: (message: string) => void; onFontReady?: () => void;
}) {
  const image = useLoadedImage(object.type === "asset" ? src : undefined, onAssetReady, onAssetError);
  const [fontEpoch, setFontEpoch] = useState(0);
  const fontId = object.type === "text" ? object.fontId : "";
  const fontText = object.type === "text" ? object.text : "";
  const fontWeight = object.type === "text" ? object.fontWeight : 400;
  const fontStyle = object.type === "text" ? object.fontStyle : "normal";
  useEffect(() => {
    if (!fontId || getFont(fontId)?.legacy) return;
    let active = true;
    ensureFontLoaded(fontId, fontText, fontWeight, fontStyle === "italic")
      .then(() => { if (active) { setFontEpoch((value) => value + 1); onFontReady?.(); } })
      .catch((error) => { if (active) onAssetError?.(error instanceof Error ? error.message : "字体加载失败。"); });
    return () => { active = false; };
  }, [fontId, fontText, fontWeight, fontStyle, onFontReady, onAssetError]);
  const selectObject = useProjectStore((state) => state.selectObject);
  const patchObject = useProjectStore((state) => state.patchObject);
  const beginGesture = useProjectStore((state) => state.beginGesture);
  const endGesture = useProjectStore((state) => state.endGesture);
  if (!object.visible) return null;
  const centerX = (object.x + object.width / 2) * k;
  const centerY = (object.y + object.height / 2) * k;
  const width = object.width * k;
  const height = object.height * k;
  const common = {
    id: object.id,
    x: centerX, y: centerY, width, height,
    offsetX: width / 2, offsetY: height / 2,
    rotation: object.rotation,
    opacity: object.opacity,
    draggable: interactive && !object.locked,
    listening: interactive && !object.locked,
    onClick: () => selectObject(object.id),
    onTap: () => selectObject(object.id),
    onDragStart: () => beginGesture(),
    onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => {
      const node = event.target;
      patchObject(object.id, { x: node.x() / k - object.width / 2, y: node.y() / k - object.height / 2 }, false);
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      const node = event.target;
      patchObject(object.id, { x: node.x() / k - object.width / 2, y: node.y() / k - object.height / 2 }, false);
      endGesture();
    },
    onTransformStart: () => beginGesture(),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target;
      const nextWidth = Math.max(4, object.width * Math.abs(node.scaleX()));
      const nextHeight = Math.max(3, object.height * Math.abs(node.scaleY()));
      const patch = {
        x: node.x() / k - nextWidth / 2,
        y: node.y() / k - nextHeight / 2,
        width: nextWidth, height: nextHeight,
        rotation: node.rotation(),
      };
      node.scale({ x: 1, y: 1 });
      if (object.type === "text") {
        patchObject(object.id, { ...patch, fontSizePt: Math.max(6, object.fontSizePt * nextHeight / object.height) }, false);
      } else patchObject(object.id, patch, false);
      endGesture();
    },
  };
  if (object.type === "text") {
    return <Text {...common} key={`${object.id}-${fontEpoch}`} text={object.text} fontFamily={canvasFontFamily(object.fontId, object.text)}
      fontSize={ptToMm(object.fontSizePt) * k} fontStyle={`${object.fontStyle} ${object.fontWeight}`}
      letterSpacing={object.letterSpacingMm * k} lineHeight={object.lineHeight}
      fill={object.color} align={object.textAlign} verticalAlign="middle" wrap="word" ellipsis={false}
      shadowColor={selected ? "#1f8a6c" : undefined} shadowBlur={selected ? 1 : 0} />;
  }
  if (!image) return <Rect {...common} fill="#ecede6" stroke="#c8d2c8" dash={[4, 3]} />;
  return <KonvaImage {...common} image={image} />;
}

export function FaceStage({ faceId, pixelsPerMm: k, assetUrls, stageRef, interactive = false, onAssetReady, onAssetError, onFontReady }: Props) {
  const internalRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const ref = stageRef ?? internalRef;
  const objects = useProjectStore((state) => state.project.faces[faceId]);
  const project = useProjectStore((state) => state.project);
  const selectedId = useProjectStore((state) => state.selectedObjectId);
  const selectObject = useProjectStore((state) => state.selectObject);
  const { width, height } = faceSize(faceId, project);
  useEffect(() => {
    if (!interactive || !transformerRef.current || !ref.current) return;
    const node = selectedId ? ref.current.findOne(`#${selectedId}`) : null;
    transformerRef.current.nodes(node && node.isVisible() && node.isListening() ? [node] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, objects, interactive, ref]);
  return <Stage width={width * k} height={height * k} ref={ref}
    onMouseDown={(event) => { if (interactive && (event.target === event.target.getStage() || event.target.name() === "paper")) selectObject(null); }}
    onTouchStart={(event) => { if (interactive && (event.target === event.target.getStage() || event.target.name() === "paper")) selectObject(null); }}>
    <Layer listening={interactive}>
      <Rect name="paper" x={0} y={0} width={width * k} height={height * k} fill="#fffdf8" />
      {objects.map((object) => <ArtworkObject key={object.id} object={object} pixelsPerMm={k}
        src={object.type === "asset" ? assetUrls[(object as AssetObject).assetId] : undefined}
        interactive={interactive} selected={interactive && selectedId === object.id}
        onAssetReady={onAssetReady} onAssetError={onAssetError} onFontReady={onFontReady} />)}
      {interactive && <Transformer ref={transformerRef} rotateEnabled
        flipEnabled={false} borderStroke="#1c8061" anchorStroke="#1c8061" anchorFill="#ffffff"
        anchorSize={9} boundBoxFunc={(oldBox, newBox) => newBox.width < 12 || newBox.height < 10 ? oldBox : newBox} />}
    </Layer>
  </Stage>;
}
