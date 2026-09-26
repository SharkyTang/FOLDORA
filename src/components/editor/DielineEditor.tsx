"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { confirmCustomRegions, deriveCustomNet, type CustomCrease, type CustomNet } from "@/core/box/custom";
import { sampleContour, type PointMm } from "@/core/box/geometry";
import { editablePath, pathWithHandles, type EditablePath } from "@/core/box/pathEdit";
import { useProjectStore } from "@/core/project/store";

type Tool = "select" | "cut" | "cutline" | "crease" | "guide" | "rect" | "ellipse" | "bezier";
type Selected = { kind: "outer" } | { kind: "hole" | "cutline" | "crease" | "guide"; id: string } | null;
const gridSizes = [.1, .5, 1, 5];
const round = (value: number) => Number(value.toFixed(3));
const pathOf = (points: PointMm[]) => points.length ? `M${points.map((point) => `${round(point.x)} ${round(point.y)}`).join(" L")} Z` : "";
const projectOnLine = (point: PointMm, start: PointMm, end: PointMm) => {
  const length2 = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y)) / length2)) : 0;
  return { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) };
};
const copy = (net: CustomNet): CustomNet => structuredClone(net);

export function DielineEditor({ onError, onOpenFace }: { onError: (message: string) => void; onOpenFace: (id: string) => void }) {
  const project = useProjectStore((state) => state.project);
  const updateCustomNet = useProjectStore((state) => state.updateCustomNet);
  const net = project.customNet!;
  const result = useMemo(() => deriveCustomNet(net), [net]);
  const edgeSamples = useMemo(() => [net.outer, ...net.holes.map((hole) => hole.path)].flatMap((path) => {
    try { return path ? [sampleContour(path, 2)] : []; } catch { return []; }
  }), [net]);
  const svg = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [grid, setGrid] = useState(1);
  const [selected, setSelected] = useState<Selected>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [editNodes, setEditNodes] = useState<PointMm[]>([]);
  const [editModel, setEditModel] = useState<EditablePath | null>(null);
  const [dragNode, setDragNode] = useState<number | null>(null);
  const [draft, setDraft] = useState<PointMm[]>([]);
  const [hover, setHover] = useState<PointMm | null>(null);
  const [shapeStart, setShapeStart] = useState<PointMm | null>(null);
  const [pending, setPending] = useState<{ net: CustomNet; from: string[] } | null>(null);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(1);
  const box = result.geometry.bounds;
  const view = net.outer ? { x: box.x - 25, y: box.y - 25, width: Math.max(120, box.width + 50),
    height: Math.max(100, box.height + 50) } : { x: 0, y: 0, width: 500, height: 350 };
  const center = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const viewBox = `${center.x - view.width / (2 * zoom)} ${center.y - view.height / (2 * zoom)} ${view.width / zoom} ${view.height / zoom}`;
  const toPoint = (event: ReactPointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>): PointMm => {
    const matrix = svg.current?.getScreenCTM()?.inverse();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  };
  const snap = (point: PointMm, anchor?: PointMm): PointMm => {
    const endpoints = net.creases.flatMap((line) => [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]);
    const candidates = [...endpoints, ...editNodes.filter((_, index) => index !== dragNode)];
    const nearby = candidates.find((candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 1.8);
    if (nearby) return { x: nearby.x, y: nearby.y };
    if (dragNode === null) {
      let nearest: PointMm | null = null, distance = 1.8;
      for (const edge of edgeSamples) for (let index = 0; index < edge.length; index++) {
        const candidate = projectOnLine(point, edge[index], edge[(index + 1) % edge.length]);
        const current = Math.hypot(point.x - candidate.x, point.y - candidate.y);
        if (current < distance) { nearest = candidate; distance = current; }
      }
      if (nearest) return { x: round(nearest.x), y: round(nearest.y) };
    }
    let x = Math.round(point.x / grid) * grid, y = Math.round(point.y / grid) * grid;
    if (anchor && Math.abs(anchor.x - x) < 1.8) x = anchor.x;
    if (anchor && Math.abs(anchor.y - y) < 1.8) y = anchor.y;
    return { x: round(x), y: round(y) };
  };
  const selectedPath = selected?.kind === "outer" ? net.outer : selected?.kind === "hole"
    ? net.holes.find((hole) => hole.id === selected.id)?.path : selected?.kind === "cutline"
      ? net.cutLines?.find((line) => line.id === selected.id)?.path : selected?.kind === "guide"
        ? net.guides.find((guide) => guide.id === selected.id)?.path : null;
  const selectPath = (next: Selected, path: string) => {
    try {
      const model = editablePath(path);
      setSelected(next); setSelectedNode(null); setEditModel(model);
      setEditNodes(model.handles.map(({ x, y }) => ({ x, y }))); setTool("select");
    } catch (error) { onError(error instanceof Error ? error.message : "路径无法编辑。"); }
  };
  const commit = (next: CustomNet) => {
    const oldIds = new Set(result.regions.filter((region) => region.printable && region.confirmed).map((region) => region.id));
    const newIds = new Set(deriveCustomNet(next).regions.filter((region) => region.printable && region.confirmed)
      .map((region) => region.id));
    const orphan = [...oldIds].filter((id) => !newIds.has(id) && (project.faces[id]?.length ?? 0) > 0);
    if (orphan.length) { setPending({ net: next, from: orphan });
      setTransfers(Object.fromEntries(orphan.map((id) => [id, [...newIds][0] ?? ""]))); return; }
    try { updateCustomNet(next); }
    catch (error) { onError(error instanceof Error ? error.message : "结构修改失败。"); }
  };
  const commitCut = (path: string) => {
    const next = copy(net);
    if (!next.outer) next.outer = path;
    else next.holes.push({ id: crypto.randomUUID(), path });
    commit(next); setDraft([]); setShapeStart(null);
  };
  const addLine = (points: PointMm[]) => {
    if (points.length < 2) return;
    const next = copy(net);
    if (tool === "crease") {
      next.creases.push({ id: crypto.randomUUID(), x1: points[0].x, y1: points[0].y,
        x2: points[1].x, y2: points[1].y, direction: "mountain", angleDeg: 90,
        start: 0, end: 100, layer: next.creases.length, confirmed: false });
    } else if (tool === "cutline") (next.cutLines ??= []).push({ id: crypto.randomUUID(),
      path: `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}` });
    else next.guides.push({ id: crypto.randomUUID(), path: `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}` });
    commit(next); setDraft([]);
  };
  const onClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (event.detail > 1 || tool === "select" || tool === "rect" || tool === "ellipse") return;
    const point = snap(toPoint(event), draft.at(-1));
    if (tool === "cut") { setDraft((old) => [...old, point]); return; }
    if (tool === "bezier") {
      const next = [...draft, point];
      if (next.length === 3) { commitCut(`M${next[0].x} ${next[0].y} Q${next[1].x} ${next[1].y} ${next[2].x} ${next[2].y} Z`); }
      else setDraft(next);
      return;
    }
    if (draft.length) addLine([draft[0], point]); else setDraft([point]);
  };
  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (tool === "cut" && draft.length >= 3) commitCut(pathOf(draft));
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "rect" || tool === "ellipse") setShapeStart(snap(toPoint(event)));
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = snap(toPoint(event), draft.at(-1) ?? shapeStart ?? undefined);
    setHover(point);
    if (dragNode !== null) setEditNodes((old) => old.map((node, index) => index === dragNode ? point : node));
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragNode !== null) {
      if (!editModel) { setDragNode(null); return; }
      const positions = editNodes.map((node, index) => index === dragNode ? snap(toPoint(event)) : node);
      setEditNodes(positions);
      const next = copy(net);
      const path = pathWithHandles(editModel, positions);
      if (selected?.kind === "outer") next.outer = path;
      if (selected?.kind === "hole") next.holes = next.holes.map((hole) => hole.id === selected.id ? { ...hole, path } : hole);
      if (selected?.kind === "cutline") next.cutLines = next.cutLines?.map((line) => line.id === selected.id ? { ...line, path } : line);
      if (selected?.kind === "guide") next.guides = next.guides.map((line) => line.id === selected.id ? { ...line, path } : line);
      commit(next); setDragNode(null); return;
    }
    if (!shapeStart || (tool !== "rect" && tool !== "ellipse")) return;
    const end = snap(toPoint(event));
    const left = Math.min(shapeStart.x, end.x), top = Math.min(shapeStart.y, end.y);
    const width = Math.abs(end.x - shapeStart.x), height = Math.abs(end.y - shapeStart.y);
    if (width < 1 || height < 1) { setShapeStart(null); return; }
    if (tool === "rect") commitCut(`M${left} ${top} H${left + width} V${top + height} H${left} Z`);
    else {
      const rx = width / 2, ry = height / 2, cx = left + rx, cy = top + ry;
      commitCut(`M${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z`);
    }
  };
  const updateCrease = (id: string, patch: Partial<CustomCrease>) => {
    const next = copy(net);
    next.creases = next.creases.map((crease) => crease.id === id ? { ...crease, ...patch, confirmed: true } : crease);
    commit(next);
  };
  const selectedCrease = selected?.kind === "crease" ? net.creases.find((line) => line.id === selected.id) : null;
  const removeSelected = () => {
    if (!selected) return;
    const next = copy(net);
    if (selected.kind === "outer") next.outer = "";
    if (selected.kind === "hole") next.holes = next.holes.filter((hole) => hole.id !== selected.id);
    if (selected.kind === "cutline") next.cutLines = next.cutLines?.filter((line) => line.id !== selected.id);
    if (selected.kind === "crease") next.creases = next.creases.filter((crease) => crease.id !== selected.id);
    if (selected.kind === "guide") next.guides = next.guides.filter((guide) => guide.id !== selected.id);
    commit(next); setSelected(null); setEditNodes([]); setEditModel(null);
  };
  const applyTransfers = () => {
    if (!pending) return;
    const valid = deriveCustomNet(pending.net).regions.filter((region) => region.printable && region.confirmed).map((region) => region.id);
    if (pending.from.some((id) => !valid.includes(transfers[id]))) { onError("请为每个原面板选择图案归属。"); return; }
    try { useProjectStore.getState().updateCustomNetWithTransfers(pending.net, transfers); setPending(null); }
    catch (error) { onError(error instanceof Error ? error.message : "面板图案归属无法应用。"); }
  };
  return <div className="dieline-editor">
    <div className="dieline-tools" role="toolbar" aria-label="刀板绘制工具">
      {([ ["select", "选择"], ["cut", "CUT 轮廓"], ["cutline", "CUT 直线"], ["crease", "CREASE 压痕"], ["guide", "辅助线"],
        ["rect", "矩形"], ["ellipse", "椭圆"], ["bezier", "贝塞尔"] ] as [Tool, string][]).map(([id, label]) =>
        <button key={id} type="button" className={tool === id ? "active" : ""}
          onClick={() => { setTool(id); setDraft([]); setShapeStart(null); }}>{label}</button>)}
      <label>网格 <select value={grid} onChange={(event) => setGrid(Number(event.target.value))}>
        {gridSizes.map((value) => <option key={value} value={value}>{value} mm</option>)}</select></label>
      <label>视图 <input type="range" min="50" max="300" value={Math.round(zoom * 100)}
        onChange={(event) => setZoom(Number(event.target.value) / 100)} aria-label="刀板编辑缩放" /></label>
      <button type="button" onClick={() => { const next = confirmCustomRegions(net); commit(next); }}>
        识别并确认面板</button>
    </div>
    <div className="dieline-content">
      <div className="dieline-stage">
        <svg ref={svg} viewBox={viewBox} role="img" aria-label="自绘刀板画布" onClick={onClick}
          onDoubleClick={onDoubleClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <path d={net.outer} fill="#f1e8d3" stroke="#207454" strokeWidth="1" onClick={(event) => {
            if (tool === "select") { event.stopPropagation(); selectPath({ kind: "outer" }, net.outer); }
          }} />
          {net.holes.map((hole) => <path key={hole.id} d={hole.path} fill="#edf0eb" stroke="#207454" strokeWidth="1"
            onClick={(event) => { if (tool === "select") { event.stopPropagation(); selectPath({ kind: "hole", id: hole.id }, hole.path); } }} />)}
          {(net.cutLines ?? []).map((line) => <path key={line.id} d={line.path} fill="none" stroke="#207454" strokeWidth="1.1"
            onClick={(event) => { if (tool === "select") { event.stopPropagation(); selectPath({ kind: "cutline", id: line.id }, line.path); } }} />)}
          {net.creases.map((crease) => <line key={crease.id} x1={crease.x1} y1={crease.y1} x2={crease.x2} y2={crease.y2}
            stroke={selected?.kind === "crease" && selected.id === crease.id ? "#d4702e" : "#346da8"}
            strokeWidth="1.1" strokeDasharray="4 2" onClick={(event) => {
              if (tool === "select") { event.stopPropagation(); setSelected({ kind: "crease", id: crease.id }); setEditNodes([]); setEditModel(null); }
            }} />)}
          {net.guides.map((guide) => <path key={guide.id} d={guide.path} fill="none" stroke="#8b9d90" strokeWidth=".8"
            strokeDasharray="2 3" onClick={(event) => {
              if (tool === "select") { event.stopPropagation(); selectPath({ kind: "guide", id: guide.id }, guide.path); }
            }} />)}
          {draft.length > 0 && <polyline points={[...draft, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="#d4702e" strokeWidth="1" pointerEvents="none" />}
          {shapeStart && hover && <rect x={Math.min(shapeStart.x, hover.x)} y={Math.min(shapeStart.y, hover.y)}
            width={Math.abs(hover.x - shapeStart.x)} height={Math.abs(hover.y - shapeStart.y)}
            fill="none" stroke="#d4702e" strokeWidth="1" pointerEvents="none" />}
          {tool === "select" && selectedPath && editNodes.map((point, index) => <circle key={index} cx={point.x} cy={point.y}
            r={selectedNode === index ? 2.7 : 1.8} fill={editModel?.handles[index]?.kind === "control" ? "#f8c588" : "#fff"}
            stroke="#bd682c" strokeWidth=".8" aria-label={editModel?.handles[index]?.kind === "control" ? "曲线控制柄" : "刀线节点"}
            onPointerDown={(event) => { event.stopPropagation(); setSelectedNode(index); setDragNode(index);
              event.currentTarget.setPointerCapture(event.pointerId); }} />)}
        </svg>
        <div className="dieline-hint">{tool === "cut" ? "依次点击节点，双击闭合。首个闭合形状为外轮廓，其余为开孔。" :
          tool === "crease" || tool === "guide" || tool === "cutline" ? "点击起点和终点；靠近节点与边缘时自动吸附。" :
          tool === "rect" || tool === "ellipse" ? "在画布上按下并拖动。" :
          tool === "bezier" ? "依次点击起点、控制点、终点。" : "点击线或轮廓后修改节点与精确尺寸。"}</div>
      </div>
      <aside className="dieline-inspector">
        <h3>结构属性</h3>
        <p className="small-note">外轮廓 {net.outer ? "已绘制" : "未绘制"} · 开孔 {net.holes.length} · 开放刀线 {net.cutLines?.length ?? 0} · 压痕 {net.creases.length} · 面板 {result.regions.length}</p>
        {selectedNode !== null && editNodes[selectedNode] && <div className="dieline-fields">
          <label>X · mm<input type="number" step=".1" value={editNodes[selectedNode].x} onChange={(event) => {
            const nodes = editNodes.map((p, index) => index === selectedNode ? { ...p, x: Number(event.target.value) } : p);
            setEditNodes(nodes);
          }} onBlur={() => { if (!editModel) return; const next = copy(net); if (selected?.kind === "outer") next.outer = pathWithHandles(editModel, editNodes);
            if (selected?.kind === "hole") next.holes = next.holes.map((h) => h.id === selected.id ? { ...h, path: pathWithHandles(editModel, editNodes) } : h);
            if (selected?.kind === "cutline") next.cutLines = next.cutLines?.map((h) => h.id === selected.id ? { ...h, path: pathWithHandles(editModel, editNodes) } : h);
            if (selected?.kind === "guide") next.guides = next.guides.map((h) => h.id === selected.id ? { ...h, path: pathWithHandles(editModel, editNodes) } : h);
            commit(next); }} /></label>
          <label>Y · mm<input type="number" step=".1" value={editNodes[selectedNode].y} onChange={(event) =>
            setEditNodes((old) => old.map((p, index) => index === selectedNode ? { ...p, y: Number(event.target.value) } : p))}
            onBlur={() => { if (!editModel) return; const next = copy(net); if (selected?.kind === "outer") next.outer = pathWithHandles(editModel, editNodes);
              if (selected?.kind === "hole") next.holes = next.holes.map((h) => h.id === selected.id ? { ...h, path: pathWithHandles(editModel, editNodes) } : h);
              if (selected?.kind === "cutline") next.cutLines = next.cutLines?.map((h) => h.id === selected.id ? { ...h, path: pathWithHandles(editModel, editNodes) } : h);
              if (selected?.kind === "guide") next.guides = next.guides.map((h) => h.id === selected.id ? { ...h, path: pathWithHandles(editModel, editNodes) } : h);
              commit(next); }} /></label></div>}
        {selectedCrease && <div className="dieline-fields">
          {(["x1", "y1", "x2", "y2"] as const).map((key) => <label key={key}>{key.toUpperCase()} · mm
            <input type="number" step=".1" value={selectedCrease[key]} onChange={(event) =>
              updateCrease(selectedCrease.id, { [key]: Number(event.target.value) })} /></label>)}
          <label>长度 · mm<input type="number" step=".1" value={round(Math.hypot(selectedCrease.x2 - selectedCrease.x1,
            selectedCrease.y2 - selectedCrease.y1))} onChange={(event) => {
              const radians = Math.atan2(selectedCrease.y2 - selectedCrease.y1, selectedCrease.x2 - selectedCrease.x1);
              const length = Number(event.target.value);
              updateCrease(selectedCrease.id, { x2: round(selectedCrease.x1 + Math.cos(radians) * length),
                y2: round(selectedCrease.y1 + Math.sin(radians) * length) });
            }} /></label>
          <label>线段角度 · °<input type="number" step=".1" value={round(Math.atan2(selectedCrease.y2 - selectedCrease.y1,
            selectedCrease.x2 - selectedCrease.x1) * 180 / Math.PI)} onChange={(event) => {
              const angle = Number(event.target.value) * Math.PI / 180;
              const length = Math.hypot(selectedCrease.x2 - selectedCrease.x1, selectedCrease.y2 - selectedCrease.y1);
              updateCrease(selectedCrease.id, { x2: round(selectedCrease.x1 + Math.cos(angle) * length),
                y2: round(selectedCrease.y1 + Math.sin(angle) * length) });
            }} /></label>
          <label>方向<select value={selectedCrease.direction} onChange={(event) =>
            updateCrease(selectedCrease.id, { direction: event.target.value as CustomCrease["direction"] })}>
            <option value="mountain">山折</option><option value="valley">谷折</option></select></label>
          <label>目标角 · °<input type="number" min="0" max="180" value={selectedCrease.angleDeg}
            onChange={(event) => updateCrease(selectedCrease.id, { angleDeg: Number(event.target.value) })} /></label>
          <label>开始进度 · %<input type="number" min="0" max="99" value={selectedCrease.start}
            onChange={(event) => updateCrease(selectedCrease.id, { start: Number(event.target.value) })} /></label>
          <label>结束进度 · %<input type="number" min="1" max="100" value={selectedCrease.end}
            onChange={(event) => updateCrease(selectedCrease.id, { end: Number(event.target.value) })} /></label>
          <label>叠放层级<input type="number" min="0" value={selectedCrease.layer}
            onChange={(event) => updateCrease(selectedCrease.id, { layer: Number(event.target.value) })} /></label>
        </div>}
        {selected && <button type="button" className="danger-link" onClick={removeSelected}>删除所选结构</button>}
        <h3>可印刷面板</h3>
        {result.regions.map((region) => <div className="dieline-panel-row" key={region.id}>
          <input aria-label={`${region.label}名称`} value={region.label} disabled={!region.confirmed}
            onChange={(event) => { const next = copy(net); next.markers = next.markers.map((marker) =>
              marker.id === region.id ? { ...marker, name: event.target.value } : marker); commit(next); }} />
          <label><input type="checkbox" checked={region.printable} disabled={!region.confirmed} onChange={(event) => {
            const next = copy(net); next.markers = next.markers.map((marker) => marker.id === region.id
              ? { ...marker, printable: event.target.checked } : marker); commit(next);
          }} /> 可印刷</label>
          <label><input type="radio" name="root-panel" checked={net.rootPanelId === region.id} disabled={!region.confirmed}
            onChange={() => commit({ ...net, rootPanelId: region.id })} /> 基准面</label>
          {region.confirmed && region.printable && <button type="button" onClick={() => onOpenFace(region.id)}>设计此面</button>}
        </div>)}
        <h3>结构检查</h3>
        {result.issues.length ? <ul className="dieline-issues">{result.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
          : <p className="small-note">结构已确认，可以预览 3D 并导出完整刀板 PDF。</p>}
      </aside>
    </div>
    {pending && <div className="dieline-modal-backdrop"><div className="dieline-modal" role="dialog" aria-modal="true"
      aria-label="确认面板图案归属"><h3>确认图案归属</h3><p>结构修改改变了已有图案的面板。请选择图案在新结构中的归属。</p>
      {pending.from.map((id) => <label key={id}>{id} · {project.faces[id]?.length ?? 0} 个对象
        <select value={transfers[id] ?? ""} onChange={(event) => setTransfers((old) => ({ ...old, [id]: event.target.value }))}>
          {deriveCustomNet(pending.net).regions.filter((region) => region.printable && region.confirmed).map((region) =>
            <option key={region.id} value={region.id}>{region.label}</option>)}</select></label>)}
      <div><button type="button" onClick={() => setPending(null)}>取消</button>
        <button type="button" onClick={applyTransfers}>确认并应用</button></div></div></div>}
  </div>;
}
