"use client";

import { useProjectStore } from "@/core/project/store";
import { getFont } from "@/core/fonts/registry";
import { EDITABLE_FACES, FACE_LABELS, objectLabel, type DesignObject } from "@/core/project/types";
import { FontPicker } from "./FontPicker";

function NumericField({ label, value, onChange, min, max, unit }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; unit?: string;
}) {
  return <label className="property-field"><span>{label}{unit ? ` · ${unit}` : ""}</span>
    <input type="number" value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0} step="any" min={min} max={max}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) onChange(next);
      }} />
  </label>;
}

export function Inspector() {
  const face = useProjectStore((state) => state.project.selectedFace);
  const selectedId = useProjectStore((state) => state.selectedObjectId);
  const object = useProjectStore((state) => state.project.faces[face].find((item) => item.id === selectedId));
  const patch = useProjectStore((state) => state.patchObject);
  return <section className="inspector-section" aria-label="对象属性">
    <div className="panel-title"><span className="eyebrow">PROPERTIES</span><h2>属性</h2></div>
    {!object ? <p className="empty-note">选择画布或图层中的对象，编辑文字、位置和外观。</p> : <>
      <div className="selection-summary"><span className="selection-dot" />{objectLabel(object)}<small>{object.type === "text" ? "文字" : "素材"}</small></div>
      {object.type === "text" && <div className="property-stack">
        <label className="property-field wide"><span>文字内容</span><textarea rows={3} value={object.text}
          onChange={(event) => patch(object.id, { text: event.target.value })} /></label>
        <div className="property-field wide"><span>字体</span><FontPicker value={object.fontId} text={object.text}
          onChange={(fontId) => {
            const font = getFont(fontId);
            patch(object.id, { fontId, fontWeight: font?.weights.includes(object.fontWeight) ? object.fontWeight : font?.weights[0] ?? 400,
              fontStyle: font?.italic ? object.fontStyle : "normal" });
          }} /></div>
        <NumericField label="字号" unit="pt" value={object.fontSizePt} min={6} max={200}
          onChange={(value) => patch(object.id, { fontSizePt: value })} />
        <label className="property-field"><span>颜色</span><input type="color" value={object.color}
          onChange={(event) => patch(object.id, { color: event.target.value })} /></label>
        <div className="format-row">
          <button type="button" aria-label="粗体" aria-pressed={object.fontWeight >= 700} title="粗体"
            disabled={!getFont(object.fontId)?.weights.includes(700)}
            onClick={() => patch(object.id, { fontWeight: object.fontWeight >= 700 ? 400 : 700 })}><b>B</b></button>
          <button type="button" aria-label="斜体" aria-pressed={object.fontStyle === "italic"} title="斜体"
            disabled={!getFont(object.fontId)?.italic}
            onClick={() => patch(object.id, { fontStyle: object.fontStyle === "italic" ? "normal" : "italic" })}><i>I</i></button>
          <select aria-label="文字对齐" value={object.textAlign} onChange={(event) => patch(object.id, { textAlign: event.target.value as "left" | "center" | "right" })}>
            <option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option>
          </select>
        </div>
        <NumericField label="字距" unit="mm" value={object.letterSpacingMm} min={-3} max={10}
          onChange={(value) => patch(object.id, { letterSpacingMm: value })} />
        <NumericField label="行距" unit="倍" value={object.lineHeight} min={.7} max={3}
          onChange={(value) => patch(object.id, { lineHeight: value })} />
      </div>}
      <div className="property-grid">
        <NumericField label="X" unit="mm" value={object.x} onChange={(value) => patch(object.id, { x: value })} />
        <NumericField label="Y" unit="mm" value={object.y} onChange={(value) => patch(object.id, { y: value })} />
        <NumericField label="宽" unit="mm" value={object.width} min={1} onChange={(value) => patch(object.id, { width: value })} />
        <NumericField label="高" unit="mm" value={object.height} min={1} onChange={(value) => patch(object.id, { height: value })} />
        <NumericField label="旋转" unit="°" value={object.rotation} onChange={(value) => patch(object.id, { rotation: value })} />
        <NumericField label="透明度" unit="%" value={object.opacity * 100} min={0} max={100}
          onChange={(value) => patch(object.id, { opacity: value / 100 })} />
      </div>
    </>}
  </section>;
}

function LayerRow({ object, selected }: { object: DesignObject; selected: boolean }) {
  const select = useProjectStore((state) => state.selectObject);
  const patch = useProjectStore((state) => state.patchObject);
  return <div className={`layer-row ${selected ? "selected" : ""}`}>
    <button type="button" className="layer-name" onClick={() => select(object.id)} title={`选择 ${objectLabel(object)}`} aria-label={`选择 ${objectLabel(object)}`}>
      <span className="layer-type">{object.type === "text" ? "T" : "▧"}</span><span>{objectLabel(object)}</span>
    </button>
    <button type="button" className="mini-icon" title={object.visible ? "隐藏图层" : "显示图层"} aria-label={object.visible ? "隐藏图层" : "显示图层"}
      onClick={() => patch(object.id, { visible: !object.visible })}>{object.visible ? "◉" : "○"}</button>
    <button type="button" className="mini-icon" title={object.locked ? "解锁图层" : "锁定图层"} aria-label={object.locked ? "解锁图层" : "锁定图层"}
      onClick={() => patch(object.id, { locked: !object.locked })}>{object.locked ? "▣" : "◇"}</button>
  </div>;
}

export function LayersPanel() {
  const project = useProjectStore((state) => state.project);
  const selectedId = useProjectStore((state) => state.selectedObjectId);
  const reorder = useProjectStore((state) => state.reorderObject);
  const remove = useProjectStore((state) => state.removeObject);
  const face = project.selectedFace;
  const objects = project.faces[face];
  return <section className="layers-section" aria-label="图层面板">
    <div className="panel-title"><span className="eyebrow">LAYERS</span><h2>图层</h2><small>{objects.length} 个对象</small></div>
    <div className="layer-face-heading">{FACE_LABELS[face]} <span>从上到下</span></div>
    <div className="layer-list">{objects.length ? [...objects].reverse().map((object) => <LayerRow key={object.id} object={object} selected={selectedId === object.id} />)
      : <p className="empty-note">当前盒面还没有对象。</p>}</div>
    <div className="layer-actions" role="group" aria-label="调整选中图层顺序">
      <button type="button" title="置顶" disabled={!selectedId} onClick={() => selectedId && reorder(selectedId, "top")}>置顶</button>
      <button type="button" title="上移一层" disabled={!selectedId} onClick={() => selectedId && reorder(selectedId, "up")}>上移</button>
      <button type="button" title="下移一层" disabled={!selectedId} onClick={() => selectedId && reorder(selectedId, "down")}>下移</button>
      <button type="button" title="置底" disabled={!selectedId} onClick={() => selectedId && reorder(selectedId, "bottom")}>置底</button>
    </div>
    <button type="button" className="danger-link" disabled={!selectedId} onClick={() => selectedId && remove(selectedId)}>删除选中图层</button>
    <div className="other-faces">{EDITABLE_FACES.filter((item) => item !== face).map((item) =>
      <span key={item}>{FACE_LABELS[item]} <b>{project.faces[item].length}</b></span>)}</div>
  </section>;
}
