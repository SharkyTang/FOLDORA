"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CanvasTexture, DoubleSide, MOUSE, Path, Shape, SRGBColorSpace } from "three";
import gsap from "gsap";
import { generateGeometry, sampleContour, type FlapGeometry } from "@/core/box/geometry";
import { useProjectStore } from "@/core/project/store";
import { EDITABLE_FACES, FACE_LABELS, type EditableFaceId } from "@/core/project/types";
import type { SurfaceMap } from "./TextureSurfaces";
import { CustomBoxPreview } from "./CustomBoxPreview";

class PreviewBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError("3D 预览无法启动，请检查浏览器是否支持 WebGL。"); }
  render() { return this.state.failed ? <div className="preview-failure">此浏览器暂时无法显示 3D 预览。</div> : this.props.children; }
}

const unit = (mm: number) => mm / 100;
const phase = (progress: number, start: number, end: number) => Math.max(0, Math.min(1, (progress - start) / (end - start)));

function PaperPanel({ face, width, height, canvas, onSelect }: {
  face: EditableFaceId; width: number; height: number; canvas?: HTMLCanvasElement; onSelect: (face: EditableFaceId) => void;
}) {
  const texture = useMemo(() => {
    if (!canvas) return null;
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    map.needsUpdate = true;
    return map;
  }, [canvas]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  return <mesh onClick={(event) => { event.stopPropagation(); if (event.delta > 5) return; onSelect(face); }}>
    <planeGeometry args={[unit(width), unit(height)]} />
    <meshStandardMaterial map={texture} color={texture ? "#ffffff" : "#f7f0df"} roughness={.87} side={DoubleSide} />
  </mesh>;
}

function StructuralFlap({ flap, anchor, layer = 2 }: { flap: FlapGeometry; anchor: "top" | "bottom" | "glue"; layer?: number }) {
  const shape = useMemo(() => {
    const polygon = sampleContour(flap.path, 1.5);
    const shape = new Shape();
    polygon.forEach((point, index) => {
      const x = anchor === "glue" ? unit(point.x - flap.width) : unit(point.x - flap.width / 2);
      const y = anchor === "bottom" ? unit(-point.y) : anchor === "glue"
        ? unit(flap.depth / 2 - point.y) : unit(flap.depth - point.y);
      if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
    shape.closePath();
    if (flap.id === "back-closure") {
      const hole = new Path();
      const radius = unit(Math.min(flap.width, flap.depth * 90 / 110) * 14 / 90);
      hole.absarc(0, unit(flap.depth * 49 / 110), radius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return shape;
  }, [flap, anchor]);
  return <mesh position={[0, 0, -unit(layer * .12)]}><shapeGeometry args={[shape]} />
    <meshStandardMaterial color="#d8c9aa" side={DoubleSide} roughness={.9} />
  </mesh>;
}

function BackClosure({ width, depth, progress }: { width: number; depth: number; progress: number }) {
  const first = depth * 18 / 110;
  const middle = depth * 67 / 110;
  const last = depth * 25 / 110;
  const holeRadius = Math.min(width, depth * 90 / 110) * 14 / 90;
  const segments = useMemo(() => [first, middle, last].map((length, index) => {
    const shape = new Shape();
    shape.moveTo(-unit(width / 2), 0);
    shape.lineTo(unit(width / 2), 0);
    shape.lineTo(unit(width / 2), unit(length));
    shape.lineTo(-unit(width / 2), unit(length));
    shape.closePath();
    if (index === 1) {
      const hole = new Path();
      hole.absarc(0, unit(depth * 49 / 110 - first), unit(holeRadius), 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return shape;
  }), [first, middle, last, width, depth, holeRadius]);
  const fold = Math.PI / 2 * phase(progress, .2, 1);
  const innerFold = Math.PI / 2 * phase(progress, .72, 1);
  const material = <meshStandardMaterial color="#d8c9aa" side={DoubleSide} roughness={.9} />;
  return <group rotation={[-fold, 0, 0]}>
    <mesh position={[0, 0, -unit(.2)]}><shapeGeometry args={[segments[0]]} />{material}</mesh>
    <group position={[0, unit(first), 0]}>
      <mesh position={[0, 0, -unit(.2)]}><shapeGeometry args={[segments[1]]} />{material}</mesh>
      <group position={[0, unit(middle), 0]} rotation={[-innerFold, 0, 0]}>
        <mesh position={[0, 0, -unit(.2)]}><shapeGeometry args={[segments[2]]} />{material}</mesh>
      </group>
    </group>
  </group>;
}

function CameraController({ targetFace, resetToken, distance, openFrame, unfoldOffset, panMode, zoomCommand, onZoomChange }: {
  targetFace: EditableFaceId | null; resetToken: number; distance: number; openFrame: boolean; unfoldOffset: number;
  panMode: boolean; zoomCommand: { percent: number; sequence: number }; onZoomChange: (value: number) => void;
}) {
  const { camera } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const fitDistance = useRef(distance * 1.27);
  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    const positions: Record<EditableFaceId, [number, number, number]> = {
      front: [0, .15, distance], back: [0, .15, -distance],
      right: [-distance, .15, 0], left: [distance, .15, 0], top: [0, distance, .02],
      bottom: [0, -distance, .02],
    };
    const position = targetFace ? positions[targetFace] : openFrame
      ? [unfoldOffset, .3, distance * 1.65] : [distance * .75, distance * .43, distance * .95];
    const aimX = openFrame && !targetFace ? unfoldOffset : 0;
    fitDistance.current = Math.hypot(position[0] - aimX, position[1], position[2]);
    const up = targetFace === "top" ? [0, 0, -1] : targetFace === "bottom" ? [0, 0, 1] : [0, 1, 0];
    gsap.killTweensOf(camera.position); gsap.killTweensOf(camera.up); gsap.killTweensOf(control.target);
    gsap.to(camera.position, { x: position[0], y: position[1], z: position[2], duration: .75, ease: "power2.inOut", onUpdate: () => control.update() });
    gsap.to(camera.up, { x: up[0], y: up[1], z: up[2], duration: .75, ease: "power2.inOut", onUpdate: () => control.update() });
    gsap.to(control.target, { x: aimX, y: 0, z: 0, duration: .75, ease: "power2.inOut", onUpdate: () => control.update() });
    return () => { gsap.killTweensOf(camera.position); gsap.killTweensOf(camera.up); gsap.killTweensOf(control.target); };
  }, [camera, targetFace, resetToken, distance, openFrame, unfoldOffset]);
  useEffect(() => {
    if (!zoomCommand.sequence || !controls.current) return;
    const control = controls.current;
    gsap.killTweensOf(camera.position);
    const direction = camera.position.clone().sub(control.target);
    if (direction.lengthSq() < 1e-8) return;
    camera.position.copy(control.target.clone().add(direction.setLength(fitDistance.current * 100 / zoomCommand.percent)));
    control.update();
  }, [camera, zoomCommand]);
  return <OrbitControls ref={controls} enablePan enableDamping dampingFactor={.08}
    mouseButtons={{ LEFT: panMode ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    minDistance={Math.max(.35, distance * .18)} maxDistance={distance * 5.2} maxPolarAngle={Math.PI - .08} minPolarAngle={.08}
    onChange={() => { if (!controls.current) return; const next = Math.round(Math.max(25, Math.min(400,
      fitDistance.current * 100 / camera.position.distanceTo(controls.current.target)))); onZoomChange(next); }}
    onStart={() => { gsap.killTweensOf(camera.position); gsap.killTweensOf(camera.up); if (controls.current) gsap.killTweensOf(controls.current.target); }} />;
}

export function BoxPreview(props: { surfaces: SurfaceMap; onSelectFace: (face: EditableFaceId) => void; onError: (message: string) => void }) {
  const mode = useProjectStore((state) => state.project.mode);
  return mode === "custom" ? <PreviewBoundary onError={props.onError}><CustomBoxPreview {...props} /></PreviewBoundary>
    : <TemplateBoxPreview {...props} />;
}

function TemplateBoxPreview({ surfaces, onSelectFace, onError }: {
  surfaces: SurfaceMap; onSelectFace: (face: EditableFaceId) => void; onError: (message: string) => void;
}) {
  const project = useProjectStore((state) => state.project);
  const geometry = useMemo(() => generateGeometry(project.templateId, project.dimensions), [project.templateId, project.dimensions]);
  const d = geometry.dimensions;
  const W = unit(d.widthMm), D = unit(d.depthMm), H = unit(d.heightMm);
  const [progress, setProgress] = useState(100);
  const [targetFace, setTargetFace] = useState<EditableFaceId | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomCommand, setZoomCommand] = useState({ percent: 100, sequence: 0 });
  const tween = useRef<gsap.core.Tween | null>(null);
  const position = useRef({ value: 100 });
  const flap = useCallback((id: string) => geometry.flaps.find((item) => item.id === id)!, [geometry]);
  const animateTo = useCallback((value: number, after?: () => void) => {
    tween.current?.kill();
    setPlaying(true);
    tween.current = gsap.to(position.current, { value, duration: Math.max(.3, Math.abs(position.current.value - value) / 52), ease: "power2.inOut",
      onUpdate: () => setProgress(Math.round(position.current.value)),
      onComplete: () => { position.current.value = value; setProgress(value); setPlaying(false); after?.(); } });
  }, []);
  useEffect(() => () => { tween.current?.kill(); }, []);
  const manual = (value: number) => { tween.current?.kill(); setPlaying(false); position.current.value = value; setProgress(value); setTargetFace(null); };
  const select = (face: EditableFaceId) => { if (panMode) return;
    onSelectFace(face); animateTo(100, () => { setZoomPercent(100); setTargetFace(face); }); };
  const foldBody = Math.PI / 2 * phase(progress / 100, 0, .82);
  const foldTop = Math.PI / 2 * phase(progress / 100, .2, 1);
  const foldDust = Math.PI / 2 * phase(progress / 100, .3, .9);
  const foldBottom = Math.PI / 2 * phase(progress / 100, .25, 1);
  const distance = Math.max(4.5, H * 1.85, (2 * W + 2 * D) * .65);
  return <div className="three-panel">
    <div className="three-toolbar">
      <span>拖动旋转／平移 · 滚轮或滑杆缩放 · 点击盒面</span>
      <div className="face-nav" role="group" aria-label="3D 镜头方向">
        <button type="button" className={!panMode ? "active" : ""} onClick={() => setPanMode(false)}>旋转</button>
        <button type="button" className={panMode ? "active" : ""} onClick={() => setPanMode(true)}>平移</button>
        <label className="camera-zoom">缩放 <input type="range" aria-label="3D 缩放" min="25" max="400" step="1"
          value={zoomPercent} onChange={(event) => { const percent = Number(event.target.value); setZoomPercent(percent);
            setZoomCommand((current) => ({ percent, sequence: current.sequence + 1 })); }} /> <output>{zoomPercent}%</output></label>
        {EDITABLE_FACES.map((face) => <button key={face} type="button" className={targetFace === face ? "active" : ""}
          onClick={() => select(face)} title={`查看${FACE_LABELS[face]}`}>{FACE_LABELS[face]}</button>)}
        <button type="button" className={targetFace === "bottom" ? "active" : ""}
          onClick={() => animateTo(100, () => { setTargetFace("bottom"); setZoomPercent(100); })} title="查看锁底结构">底面</button>
        <button type="button" onClick={() => { setTargetFace(null); setZoomPercent(100); setResetToken((value) => value + 1); }} title="复位视角、平移和缩放">复位</button>
      </div>
    </div>
    <div className="fold-controls" role="group" aria-label="折叠进度">
      <button type="button" onClick={() => { setTargetFace(null); animateTo(0); }}>展开</button>
      <button type="button" onClick={() => { setTargetFace(null); animateTo(50); }}>半折</button>
      <button type="button" onClick={() => { setTargetFace(null); animateTo(100); }}>合盒</button>
      <input type="range" min="0" max="100" value={progress} onChange={(event) => manual(Number(event.target.value))}
        aria-label="折叠进度" /><output>{progress}%</output>
      <button type="button" onClick={() => { if (playing) { tween.current?.kill(); setPlaying(false); } else animateTo(progress >= 100 ? 0 : 100); }}>
        {playing ? "暂停" : "播放"}</button>
    </div>
    <div className="three-viewport" data-testid="three-viewport" data-fold-progress={progress}>
      <PreviewBoundary onError={onError}>
        <Canvas camera={{ position: [distance * .75, distance * .43, distance * .95], fov: 35, near: .1, far: 100 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={({ gl }) => { gl.setClearColor("#edf0eb"); }}>
          <ambientLight intensity={2.1} />
          <directionalLight position={[3, 5, 4]} intensity={2.3} />
          <directionalLight position={[-3, 2, -4]} intensity={1} />
          <group position={[0, 0, D / 2 * progress / 100]}>
            <PaperPanel face="front" width={d.widthMm} height={d.heightMm} canvas={surfaces.front} onSelect={select} />
            <group position={[-W / 2, 0, 0]} rotation={[0, -foldBody, 0]}>
              <group position={[-D / 2, 0, 0]}>
                <PaperPanel face="right" width={d.depthMm} height={d.heightMm} canvas={surfaces.right} onSelect={select} />
                <group position={[0, H / 2, 0]} rotation={[-foldDust, 0, 0]}><StructuralFlap flap={flap("dust-right")} anchor="top" /></group>
                <group position={[0, -H / 2, 0]} rotation={[foldBottom, 0, 0]}><StructuralFlap flap={flap("bottom-right")} anchor="bottom" /></group>
              </group>
              <group position={[-D, 0, 0]} rotation={[0, -foldBody, 0]}>
                <group position={[-W / 2, 0, 0]}>
                  <PaperPanel face="back" width={d.widthMm} height={d.heightMm} canvas={surfaces.back} onSelect={select} />
                <group position={[0, H / 2, 0]}><BackClosure width={d.widthMm} depth={flap("back-closure").depth} progress={progress / 100} /></group>
                <group position={[0, -H / 2, 0]} rotation={[foldBottom, 0, 0]}><StructuralFlap flap={flap("bottom-back")} anchor="bottom" layer={1} /></group>
                </group>
                <group position={[-W, 0, 0]} rotation={[0, -foldBody, 0]}>
                  <group position={[-D / 2, 0, 0]}>
                    <PaperPanel face="left" width={d.depthMm} height={d.heightMm} canvas={surfaces.left} onSelect={select} />
                    <group position={[0, H / 2, 0]} rotation={[-foldDust, 0, 0]}><StructuralFlap flap={flap("dust-left")} anchor="top" /></group>
                    <group position={[0, -H / 2, 0]} rotation={[foldBottom, 0, 0]}><StructuralFlap flap={flap("bottom-left")} anchor="bottom" layer={3} /></group>
                  </group>
                  <group position={[-D, 0, 0]} rotation={[0, -foldBody, 0]}><StructuralFlap flap={flap("glue")} anchor="glue" /></group>
                </group>
              </group>
            </group>
            <group position={[0, H / 2, 0]} rotation={[-foldTop, 0, 0]}>
              <group position={[0, D / 2, 0]}><PaperPanel face="top" width={d.widthMm} height={d.depthMm} canvas={surfaces.top} onSelect={select} /></group>
              <group position={[0, D, 0]} rotation={[-foldTop, 0, 0]}><StructuralFlap flap={flap("tuck")} anchor="top" /></group>
            </group>
            <group position={[0, -H / 2, 0]} rotation={[foldBottom, 0, 0]}><StructuralFlap flap={flap("bottom-front")} anchor="bottom" layer={4} /></group>
          </group>
          <CameraController targetFace={targetFace} resetToken={resetToken} distance={distance}
            openFrame={progress === 0} unfoldOffset={-(W + 2 * D + unit(d.glueFlapMm)) / 2}
            panMode={panMode} zoomCommand={zoomCommand} onZoomChange={setZoomPercent} />
        </Canvas>
      </PreviewBoundary>
    </div>
    <div className="three-caption">{d.widthMm} × {d.depthMm} × {d.heightMm} mm · 折片为结构示意预览</div>
  </div>;
}
