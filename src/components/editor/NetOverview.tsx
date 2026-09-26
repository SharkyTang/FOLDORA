"use client";

import { useMemo } from "react";
import { guideContours, type PointMm } from "@/core/box/geometry";
import { geometryForProject } from "@/core/box/resolve";
import { useProjectStore } from "@/core/project/store";
import { faceLabel } from "@/core/project/types";
import type { PreviewMap } from "./TextureSurfaces";

function pointsPath(points: PointMm[]): string {
  return points.length ? `M${points.map((point) => `${point.x} ${point.y}`).join(" L")} Z` : "";
}

export function NetOverview({ previews, showBleed = false, showSafe = false }: {
  previews: PreviewMap; showBleed?: boolean; showSafe?: boolean;
}) {
  const project = useProjectStore((state) => state.project);
  const selected = project.selectedFace;
  const setFace = useProjectStore((state) => state.setFace);
  const geometry = useMemo(() => geometryForProject(project), [project]);
  const bleed = useMemo(() => showBleed ? guideContours(geometry, project.print.bleedMm, "bleed") : null,
    [showBleed, geometry, project.print.bleedMm]);
  const safe = useMemo(() => showSafe ? guideContours(geometry, project.print.safeAreaMm, "safe") : null,
    [showSafe, geometry, project.print.safeAreaMm]);
  return <div className="net-overview">
    <svg viewBox={geometry.viewBox} role="img" aria-label="完整刀板总览">
      <path d={[geometry.perimeter, ...(geometry.holes ?? (geometry.backHole ? [geometry.backHole] : []))].join(" ")}
        fill="#f1e8d3" fillRule="evenodd" stroke="none" />
      {geometry.panels.map((panel) => <g key={panel.id}>
        {previews[panel.id] && <image href={previews[panel.id]}
          x={panel.x} y={panel.y} width={panel.width} height={panel.height} preserveAspectRatio="none" />}
      </g>)}
      {bleed && <g fill="none" stroke="#bc643d" strokeWidth=".8" strokeDasharray="3 2" pointerEvents="none">
        <path d={pointsPath(bleed.outer)} />{bleed.holes.map((hole, index) => <path key={index} d={pointsPath(hole)} />)}</g>}
      {safe && <g fill="none" stroke="#467db8" strokeWidth=".8" strokeDasharray="2 2" pointerEvents="none">
        <path d={pointsPath(safe.outer)} />{safe.holes.map((hole, index) => <path key={index} d={pointsPath(hole)} />)}</g>}
      <path d={[geometry.perimeter, ...(geometry.holes ?? (geometry.backHole ? [geometry.backHole] : []))].join(" ")}
        fill="none" stroke="#207454" strokeWidth="1.1" pointerEvents="none" />
      {geometry.cut.filter((line) => line.closed === false).map((line) => <path key={line.id} d={line.path}
        fill="none" stroke="#207454" strokeWidth="1.1" pointerEvents="none" />)}
      {geometry.creases.map((crease) => <line key={crease.id} x1={crease.x1} y1={crease.y1} x2={crease.x2} y2={crease.y2}
        stroke="#207454" strokeWidth=".8" strokeDasharray="4 2" pointerEvents="none" />)}
      {geometry.panels.map((panel) => <g key={`hit-${panel.id}`} onClick={() => setFace(panel.id)}
        role="button" tabIndex={0} aria-label={`编辑${faceLabel(project, panel.id)}`}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setFace(panel.id); }}>
        <rect x={panel.x} y={panel.y} width={panel.width} height={panel.height} fill="transparent" className="net-hit" />
        <rect x={panel.x + 2} y={panel.y + 2} width={panel.width - 4} height={panel.height - 4}
          fill="none" stroke={selected === panel.id ? "#cf7d32" : "transparent"} strokeWidth="2.5" pointerEvents="none" />
        <text x={panel.x + 5} y={panel.y + 11} className="net-face-label" pointerEvents="none">{faceLabel(project, panel.id)}</text>
      </g>)}
    </svg>
    <div className="net-legend"><span><i className="cut-sample" />CUT 刀线</span><span><i className="crease-sample" />CREASE 压痕</span></div>
  </div>;
}
