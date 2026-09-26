"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Line, LineBasicMaterial, MOUSE, Path, Quaternion, Shape,
  ShapeGeometry, SRGBColorSpace, Vector3 } from "three";
import gsap from "gsap";
import { deriveCustomNet, type CustomRegion } from "@/core/box/custom";
import { sampleContour, type HingeGeometry, type PointMm } from "@/core/box/geometry";
import { useProjectStore } from "@/core/project/store";
import type { SurfaceMap } from "./TextureSurfaces";

const unit = (mm: number) => mm / 100;
const signedArea = (points: PointMm[]) => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y;
}, 0);

function PanelMesh({ region, origin, canvas, layer, onSelect }: {
  region: CustomRegion; origin: PointMm; canvas?: HTMLCanvasElement; layer: number; onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => {
    const shape = new Shape();
    const draw = (path: Shape | Path, points: PointMm[]) => points.forEach((point, index) => {
      const x = unit(point.x - origin.x), y = unit(origin.y - point.y);
      if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
    });
    draw(shape, region.points); shape.closePath();
    for (const holeSvg of region.holes) {
      const points = sampleContour(holeSvg, .4);
      const hole = new Path();
      draw(hole, signedArea(points) * signedArea(region.points) > 0 ? [...points].reverse() : points);
      hole.closePath(); shape.holes.push(hole);
    }
    const mesh = new ShapeGeometry(shape);
    const positions = mesh.getAttribute("position");
    const uvs: number[] = [];
    for (let index = 0; index < positions.count; index++) {
      const x = origin.x + positions.getX(index) * 100;
      const y = origin.y - positions.getY(index) * 100;
      uvs.push((x - region.x) / region.width, (region.y + region.height - y) / region.height);
    }
    mesh.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    return mesh;
  }, [region, origin]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const texture = useMemo(() => {
    if (!canvas) return null;
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  }, [canvas]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  const cutLines = useMemo(() => region.cutLines.map((path) => {
    const line = new Line(new BufferGeometry().setFromPoints(
      sampleContour(path, .4).map((point) => new Vector3(unit(point.x - origin.x), unit(origin.y - point.y), 0))),
    new LineBasicMaterial({ color: "#207454" }));
    line.position.z = unit(layer * .12 + .25);
    return line;
  }), [region.cutLines, origin, layer]);
  useEffect(() => () => cutLines.forEach((line) => { line.geometry.dispose(); line.material.dispose(); }), [cutLines]);
  return <>
    <mesh geometry={geometry} position={[0, 0, unit(layer * .12)]}
      onClick={(event) => { event.stopPropagation(); if (event.delta > 5) return; onSelect(region.id); }}>
      <meshStandardMaterial map={texture} color={texture ? "#ffffff" : "#f1e8d3"}
        side={DoubleSide} transparent={Boolean(texture)} roughness={.88} />
    </mesh>
    {cutLines.map((line, index) => <primitive key={index} object={line} />)}
  </>;
}

function FoldNode({ id, origin, regions, hinges, progress, surfaces, onSelect }: {
  id: string; origin: PointMm; regions: CustomRegion[]; hinges: HingeGeometry[]; progress: number;
  surfaces: SurfaceMap; onSelect: (id: string) => void;
}) {
  const region = regions.find((item) => item.id === id);
  if (!region) return null;
  const parentHinge = hinges.find((hinge) => hinge.childId === id);
  return <>
    <PanelMesh region={region} origin={origin} canvas={surfaces[id]} layer={parentHinge?.layer ?? 0} onSelect={onSelect} />
    {hinges.filter((hinge) => hinge.parentId === id).map((hinge) => {
      const midpoint = { x: (hinge.x1 + hinge.x2) / 2, y: (hinge.y1 + hinge.y2) / 2 };
      const axis = new Vector3(hinge.x2 - hinge.x1, -(hinge.y2 - hinge.y1), 0).normalize();
      const t = Math.max(0, Math.min(1, (progress - hinge.start) / (hinge.end - hinge.start)));
      const sign = hinge.direction === "mountain" ? 1 : -1;
      const quaternion = new Quaternion().setFromAxisAngle(axis, sign * hinge.angleDeg * Math.PI / 180 * t);
      return <group key={hinge.id} position={[unit(midpoint.x - origin.x), unit(origin.y - midpoint.y), 0]}
        quaternion={quaternion}>
        <FoldNode id={hinge.childId} origin={midpoint} regions={regions} hinges={hinges}
          progress={progress} surfaces={surfaces} onSelect={onSelect} />
      </group>;
    })}
  </>;
}

function Camera({ distance, panMode, zoomCommand, onZoomChange, resetToken }: {
  distance: number; panMode: boolean; zoomCommand: { percent: number; sequence: number };
  onZoomChange: (value: number) => void; resetToken: number;
}) {
  const { camera } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const fitDistance = distance * Math.hypot(.75, .43, .95);
  useEffect(() => {
    if (!controls.current) return;
    controls.current.target.set(0, 0, 0);
    camera.position.set(distance * .75, distance * .43, distance * .95);
    camera.up.set(0, 1, 0);
    controls.current.update();
  }, [camera, distance, resetToken]);
  useEffect(() => {
    if (!controls.current || !zoomCommand.sequence) return;
    const direction = camera.position.clone().sub(controls.current.target);
    camera.position.copy(controls.current.target.clone().add(direction.setLength(fitDistance * 100 / zoomCommand.percent)));
    controls.current.update();
  }, [camera, fitDistance, zoomCommand]);
  return <OrbitControls ref={controls} enablePan enableDamping dampingFactor={.08}
    mouseButtons={{ LEFT: panMode ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
    minDistance={Math.max(.25, distance * .15)} maxDistance={distance * 5.2}
    onChange={() => { if (controls.current) onZoomChange(Math.round(Math.max(25, Math.min(400,
      fitDistance * 100 / camera.position.distanceTo(controls.current.target))))); }} />;
}

export function CustomBoxPreview({ surfaces, onSelectFace, onError }: {
  surfaces: SurfaceMap; onSelectFace: (face: string) => void; onError: (message: string) => void;
}) {
  const project = useProjectStore((state) => state.project);
  const result = useMemo(() => deriveCustomNet(project.customNet!), [project.customNet]);
  const [progress, setProgress] = useState(100);
  const [panMode, setPanMode] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomCommand, setZoomCommand] = useState({ percent: 100, sequence: 0 });
  const [resetToken, setResetToken] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tween = useRef<gsap.core.Tween | null>(null);
  const progressRef = useRef({ value: 100 });
  useEffect(() => () => { tween.current?.kill(); }, []);
  const setManual = (value: number) => { tween.current?.kill(); setPlaying(false); progressRef.current.value = value; setProgress(value); };
  const animateTo = (value: number) => {
    tween.current?.kill(); setPlaying(true);
    tween.current = gsap.to(progressRef.current, { value, duration: Math.max(.3, Math.abs(progressRef.current.value - value) / 52),
      onUpdate: () => setProgress(Math.round(progressRef.current.value)),
      onComplete: () => { setProgress(value); setPlaying(false); } });
  };
  const { geometry, regions, issues } = result;
  const root = regions.find((region) => region.id === geometry.rootPanelId);
  const origin = root ? { x: root.x + root.width / 2, y: root.y + root.height / 2 } : { x: 0, y: 0 };
  const distance = Math.max(2.5, unit(Math.max(geometry.bounds.width, geometry.bounds.height)) * 1.4);
  if (issues.length || !root) return <div className="preview-failure custom-preview-failure">
    <strong>请先完成刀板结构确认</strong><span>{issues[0] ?? "请选择基准面板。"}</span>
    <button type="button" onClick={() => onError(issues.join(" "))}>查看全部问题</button>
  </div>;
  return <div className="three-panel">
    <div className="three-toolbar"><span>拖动旋转／平移 · 滚轮或滑杆缩放 · 点击面板</span>
      <div className="face-nav" role="group" aria-label="自绘刀板 3D 镜头">
        <button type="button" className={!panMode ? "active" : ""} onClick={() => setPanMode(false)}>旋转</button>
        <button type="button" className={panMode ? "active" : ""} onClick={() => setPanMode(true)}>平移</button>
        <label className="camera-zoom">缩放 <input type="range" aria-label="3D 缩放" min="25" max="400" value={zoomPercent}
          onChange={(event) => { const percent = Number(event.target.value); setZoomPercent(percent);
            setZoomCommand((current) => ({ percent, sequence: current.sequence + 1 })); }} /> <output>{zoomPercent}%</output></label>
        <button type="button" onClick={() => { setZoomPercent(100); setResetToken((value) => value + 1); }}>复位</button>
      </div>
    </div>
    <div className="fold-controls" role="group" aria-label="折叠进度">
      <button type="button" onClick={() => animateTo(0)}>展开</button>
      <button type="button" onClick={() => animateTo(50)}>半折</button>
      <button type="button" onClick={() => animateTo(100)}>合盒</button>
      <input type="range" min="0" max="100" value={progress} aria-label="折叠进度"
        onChange={(event) => setManual(Number(event.target.value))} /><output>{progress}%</output>
      <button type="button" onClick={() => { if (playing) { tween.current?.kill(); setPlaying(false); }
        else animateTo(progress >= 100 ? 0 : 100); }}>{playing ? "暂停" : "播放"}</button>
    </div>
    <div className="three-viewport" data-testid="three-viewport" data-fold-progress={progress}>
      <Canvas camera={{ position: [distance * .75, distance * .43, distance * .95], fov: 35, near: .05, far: 200 }}
        gl={{ antialias: true }} onCreated={({ gl }) => gl.setClearColor("#edf0eb")}>
        <ambientLight intensity={2.1} /><directionalLight position={[3, 5, 4]} intensity={2.3} />
        <directionalLight position={[-3, 2, -4]} intensity={1} />
        <FoldNode id={root.id} origin={origin} regions={regions} hinges={geometry.hinges ?? []}
          progress={progress} surfaces={surfaces} onSelect={panMode ? () => undefined : onSelectFace} />
        <Camera distance={distance} panMode={panMode} zoomCommand={zoomCommand}
          onZoomChange={setZoomPercent} resetToken={resetToken} />
      </Canvas>
    </div>
    <div className="three-caption">自绘刀板 · {regions.length} 个面板 · 折叠为结构示意预览</div>
  </div>;
}
