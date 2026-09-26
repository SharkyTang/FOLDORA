"use client";

import { DIECUT } from "@/core/box/reference";
import { useProjectStore } from "@/core/project/store";
import { FACE_LABELS, type EditableFaceId } from "@/core/project/types";
import type { PreviewMap } from "./TextureSurfaces";

export function NetOverview({ previews }: { previews: PreviewMap }) {
  const selected = useProjectStore((state) => state.project.selectedFace);
  const setFace = useProjectStore((state) => state.setFace);
  return <div className="net-overview">
    <svg viewBox={DIECUT.viewBox} role="img" aria-label="固定酒盒刀板，四面依次为左、背、右、前">
      <path d={`${DIECUT.perimeter} ${DIECUT.backHole}`} fill="#f1e8d3" fillRule="evenodd" stroke="none" />
      {DIECUT.panels.map((panel) => <g key={panel.id}>
        {previews[panel.id as EditableFaceId] && <image href={previews[panel.id as EditableFaceId]}
          x={panel.x} y={panel.y} width={panel.width} height={panel.height} preserveAspectRatio="none" />}
      </g>)}
      <path d={`${DIECUT.perimeter} ${DIECUT.backHole}`} fill="none" stroke="#207454" strokeWidth="1.1" pointerEvents="none" />
      {DIECUT.creases.map((crease) => <line key={crease.id} x1={crease.x1} y1={crease.y1} x2={crease.x2} y2={crease.y2}
        stroke="#207454" strokeWidth=".8" strokeDasharray="4 2" pointerEvents="none" />)}
      {DIECUT.panels.map((panel) => <g key={`hit-${panel.id}`} onClick={() => setFace(panel.id as EditableFaceId)}
        role="button" tabIndex={0} aria-label={`编辑${FACE_LABELS[panel.id as EditableFaceId]}`}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setFace(panel.id as EditableFaceId); }}>
        <rect x={panel.x} y={panel.y} width={panel.width} height={panel.height} fill="transparent" className="net-hit" />
        <rect x={panel.x + 2} y={panel.y + 2} width={panel.width - 4} height={panel.height - 4}
          fill="none" stroke={selected === panel.id ? "#cf7d32" : "transparent"} strokeWidth="2.5" pointerEvents="none" />
        <text x={panel.x + 5} y={panel.y + 11} className="net-face-label" pointerEvents="none">{FACE_LABELS[panel.id as EditableFaceId]}</text>
      </g>)}
    </svg>
    <div className="net-legend"><span><i className="cut-sample" />CUT 刀线</span><span><i className="crease-sample" />CREASE 压痕</span></div>
  </div>;
}
