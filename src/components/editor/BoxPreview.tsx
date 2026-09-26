"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CanvasTexture, DoubleSide, SRGBColorSpace } from "three";
import gsap from "gsap";
import { EDITABLE_FACES, FACE_LABELS, type EditableFaceId } from "@/core/project/types";
import type { SurfaceMap } from "./TextureSurfaces";

class PreviewBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError("3D 预览无法启动，请检查浏览器是否支持 WebGL。"); }
  render() { return this.state.failed ? <div className="preview-failure">此浏览器暂时无法显示 3D 预览。</div> : this.props.children; }
}

const FACE_LAYOUT: Record<EditableFaceId, { position: [number, number, number]; rotation: [number, number, number]; size: [number, number] }> = {
  front: { position: [0, 0, .451], rotation: [0, 0, 0], size: [.9, 2.35] },
  back: { position: [0, 0, -.451], rotation: [0, Math.PI, 0], size: [.9, 2.35] },
  left: { position: [-.451, 0, 0], rotation: [0, -Math.PI / 2, 0], size: [.9, 2.35] },
  right: { position: [.451, 0, 0], rotation: [0, Math.PI / 2, 0], size: [.9, 2.35] },
  top: { position: [0, 1.176, 0], rotation: [-Math.PI / 2, 0, 0], size: [.9, .9] },
};

const CAMERA_POSITIONS: Record<EditableFaceId, [number, number, number]> = {
  front: [0, .15, 4.5], back: [0, .15, -4.5], left: [-4.5, .15, 0], right: [4.5, .15, 0], top: [0, 4.5, .02],
};

function TexturedFace({ face, canvas, onSelect }: { face: EditableFaceId; canvas?: HTMLCanvasElement; onSelect: (face: EditableFaceId) => void }) {
  const texture = useMemo(() => {
    if (!canvas) return null;
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 4;
    result.needsUpdate = true;
    return result;
  }, [canvas]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  const layout = FACE_LAYOUT[face];
  return <mesh position={layout.position} rotation={layout.rotation}
    onClick={(event) => { event.stopPropagation(); onSelect(face); }}>
    <planeGeometry args={layout.size} />
    <meshStandardMaterial map={texture} color={texture ? "#ffffff" : "#f7f0df"} roughness={.87} side={DoubleSide} />
  </mesh>;
}

function CameraController({ targetFace, resetToken }: { targetFace: EditableFaceId | null; resetToken: number }) {
  const { camera } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const control = controls.current;
    if (!control) return;
    const position = targetFace ? CAMERA_POSITIONS[targetFace] : [3.4, 1.9, 4.3];
    const up = targetFace === "top" ? [0, 0, -1] : [0, 1, 0];
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera.up);
    gsap.killTweensOf(control.target);
    gsap.to(camera.position, { x: position[0], y: position[1], z: position[2], duration: .75, ease: "power2.inOut", onUpdate: () => control.update() });
    gsap.to(camera.up, { x: up[0], y: up[1], z: up[2], duration: .75, ease: "power2.inOut", onUpdate: () => control.update() });
    gsap.to(control.target, { x: 0, y: 0, z: 0, duration: .75, ease: "power2.inOut", onUpdate: () => control.update() });
    return () => { gsap.killTweensOf(camera.position); gsap.killTweensOf(camera.up); gsap.killTweensOf(control.target); };
  }, [camera, targetFace, resetToken]);
  return <OrbitControls ref={controls} enablePan={false} enableDamping dampingFactor={.08}
    minDistance={2.7} maxDistance={8} maxPolarAngle={Math.PI - .08} minPolarAngle={.08}
    onStart={() => { gsap.killTweensOf(camera.position); gsap.killTweensOf(camera.up); if (controls.current) gsap.killTweensOf(controls.current.target); }} />;
}

export function BoxPreview({ surfaces, onSelectFace, onError }: {
  surfaces: SurfaceMap; onSelectFace: (face: EditableFaceId) => void; onError: (message: string) => void;
}) {
  const [targetFace, setTargetFace] = useState<EditableFaceId | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const select = (face: EditableFaceId) => { setTargetFace(face); onSelectFace(face); };
  return <div className="three-panel">
    <div className="three-toolbar">
      <span>拖动旋转 · 滚轮缩放 · 点击盒面</span>
      <div className="face-nav" role="group" aria-label="3D 镜头方向">
        {EDITABLE_FACES.map((face) => <button key={face} type="button" className={targetFace === face ? "active" : ""}
          onClick={() => select(face)} title={`查看${FACE_LABELS[face]}`}>{FACE_LABELS[face]}</button>)}
        <button type="button" onClick={() => { setTargetFace(null); setResetToken((value) => value + 1); }} title="复位视角">复位</button>
      </div>
    </div>
    <div className="three-viewport" data-testid="three-viewport">
      <PreviewBoundary onError={onError}>
        <Canvas camera={{ position: [3.4, 1.9, 4.3], fov: 35, near: .1, far: 100 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={({ gl }) => { gl.setClearColor("#edf0eb"); }}>
          <ambientLight intensity={2.1} />
          <directionalLight position={[3, 5, 4]} intensity={2.3} />
          <directionalLight position={[-3, 2, -4]} intensity={1} />
          <mesh><boxGeometry args={[.9, 2.35, .9]} /><meshStandardMaterial color="#d3c5a8" roughness={.9} /></mesh>
          {EDITABLE_FACES.map((face) => <TexturedFace key={face} face={face} canvas={surfaces[face]} onSelect={select} />)}
          <mesh position={[0, -1.176, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[.9, .9]} /><meshStandardMaterial color="#d3c5a8" side={DoubleSide} /></mesh>
          <CameraController targetFace={targetFace} resetToken={resetToken} />
        </Canvas>
      </PreviewBoundary>
    </div>
    <div className="three-caption">90 × 90 × 235 mm · 结构示意预览</div>
  </div>;
}
