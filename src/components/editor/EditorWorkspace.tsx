"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { validateDimensions, type BoxDimensions } from "@/core/box/geometry";
import { runPreflight, type PreflightIssue } from "@/core/print/preflight";
import { buildProofPdf, DEFAULT_EXPORT_SETTINGS, type ExportSettings } from "@/core/print/pdf";
import { useProjectStore } from "@/core/project/store";
import { loadAssetUrls, loadOrCreateProject, saveAssetBlob, saveProject } from "@/core/project/storage";
import { BUILTIN_ASSETS, EDITABLE_FACES, FACE_LABELS, faceSize, type AssetMeta, type Project } from "@/core/project/types";
import { BoxPreview } from "./BoxPreview";
import { FaceStage } from "./FaceStage";
import { Inspector, LayersPanel } from "./Inspector";
import { NetOverview } from "./NetOverview";
import { TextureSurfaces, type PreviewMap, type SurfaceHandle, type SurfaceMap } from "./TextureSurfaces";
import "./fontStyles";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function ViewCanvas({ assetUrls, onAssetError, showBleed, showSafe }: {
  assetUrls: Record<string, string>; onAssetError: (message: string) => void; showBleed: boolean; showSafe: boolean;
}) {
  const face = useProjectStore((state) => state.project.selectedFace);
  const project = useProjectStore((state) => state.project);
  const [zoom, setZoom] = useState(1);
  const [bounds, setBounds] = useState({ width: 650, height: 650 });
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!holder.current) return;
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  const size = faceSize(face, project);
  const fit = Math.max(1, Math.min((bounds.width - 64) / size.width, (bounds.height - 64) / size.height));
  const scale = fit * zoom;
  return <div className="canvas-workspace">
    <div className="canvas-toolbar"><div><span className="eyebrow">EDITING FACE</span><strong>{FACE_LABELS[face]}</strong><small>{size.width} × {size.height} mm</small></div>
      <div className="zoom-controls" role="group" aria-label="画布缩放">
        <button type="button" title="缩小画布" onClick={() => setZoom((z) => Math.max(.5, z / 1.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" title="放大画布" onClick={() => setZoom((z) => Math.min(3, z * 1.25))}>＋</button>
        <button type="button" title="适合窗口" onClick={() => setZoom(1)}>适合</button>
      </div>
    </div>
    <div className="canvas-scroll" ref={holder} data-testid="face-canvas">
      <div className="canvas-paper" style={{ width: size.width * scale, height: size.height * scale }}>
        <FaceStage faceId={face} pixelsPerMm={scale} assetUrls={assetUrls} interactive onAssetError={onAssetError} />
        {showBleed && <div className="face-bleed-guide" style={{ inset: -project.print.bleedMm * scale }} aria-hidden="true" />}
        {showSafe && <div className="face-safe-guide" style={{ inset: project.print.safeAreaMm * scale }} aria-hidden="true" />}
      </div>
    </div>
    <div className="canvas-status">盒面设计区域 · 鼠标拖动对象，拖动控制点缩放或旋转</div>
  </div>;
}

function DimensionsPanel({ onError }: { onError: (message: string) => void }) {
  const dimensions = useProjectStore((state) => state.project.dimensions);
  const updateDimensions = useProjectStore((state) => state.updateDimensions);
  const [draft, setDraft] = useState<BoxDimensions>(dimensions);
  const fields: [keyof BoxDimensions, string][] = [
    ["widthMm", "宽 W"], ["depthMm", "深 D"], ["heightMm", "高 H"], ["glueFlapMm", "糊口 Glue"],
  ];
  return <section><span className="eyebrow">PARAMETRIC BOX</span><h2>盒型尺寸</h2>
    <div className="dimension-grid">{fields.map(([key, label]) => <label key={key} className="property-field">{label} · mm
      <input type="number" min="1" step="1" value={draft[key]}
        onChange={(event) => setDraft((previous) => ({ ...previous, [key]: Number(event.target.value) }))} /></label>)}</div>
    <button type="button" className="panel-action" onClick={() => {
      const errors = validateDimensions(draft);
      if (errors.length) { onError(errors.join(" ")); return; }
      try { updateDimensions(draft); } catch (error) { onError(error instanceof Error ? error.message : "刀板尺寸无效。"); }
    }}>更新刀板</button>
    <p className="small-note">更改尺寸作为一次可撤销操作。图案保留原有 mm 坐标；越界将在印前检查中提示。</p>
  </section>;
}

function PreflightPanel({ issues, onLocate }: { issues: PreflightIssue[]; onLocate: (issue: PreflightIssue) => void }) {
  const errors = issues.filter((issue) => issue.level === "error").length;
  return <section className="preflight-section"><span className="eyebrow">PREFLIGHT</span><h2>印前检查</h2>
    <p className="preflight-summary" role="status">{errors ? `${errors} 项阻止 PDF 导出` : "可导出 RGB 校样 PDF"} · {issues.length} 项提示</p>
    {issues.length ? <div className="preflight-list">{issues.map((issue, index) => <button type="button"
      key={`${issue.code}-${issue.objectId ?? index}`} className={`preflight-issue ${issue.level}`} onClick={() => onLocate(issue)}
      title={issue.faceId ? `定位到${FACE_LABELS[issue.faceId]}` : issue.message}>
      <strong>{issue.level === "error" ? "阻止" : issue.level === "strong-warning" ? "强警告" : "提醒"}</strong><span>{issue.message}</span>
    </button>)}</div> : <p className="small-note">当前未发现尺寸、素材、字体或 DPI 问题。</p>}
  </section>;
}

export default function EditorWorkspace() {
  const project = useProjectStore((state) => state.project);
  const selectedId = useProjectStore((state) => state.selectedObjectId);
  const setFace = useProjectStore((state) => state.setFace);
  const addText = useProjectStore((state) => state.addText);
  const addAssetObject = useProjectStore((state) => state.addAssetObject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const removeObject = useProjectStore((state) => state.removeObject);
  const clear = useProjectStore((state) => state.clear);
  const updatePrint = useProjectStore((state) => state.updatePrint);
  const selectObject = useProjectStore((state) => state.selectObject);
  const past = useProjectStore((state) => state.past);
  const future = useProjectStore((state) => state.future);
  const [hydrated, setHydrated] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [surfaces, setSurfaces] = useState<SurfaceMap>({});
  const [previews, setPreviews] = useState<PreviewMap>({});
  const [activeView, setActiveView] = useState<"two" | "three">("two");
  const [saveStatus, setSaveStatus] = useState("正在读取本机项目…");
  const [savedProject, setSavedProject] = useState<Project | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showBleed, setShowBleed] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [exporting, setExporting] = useState(false);
  const surfaceRef = useRef<SurfaceHandle>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const generatedUrls = useRef<string[]>([]);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await loadOrCreateProject();
        const urls = await loadAssetUrls(result.project);
        if (!active) { Object.values(urls).filter((url) => url.startsWith("blob:")).forEach(URL.revokeObjectURL); return; }
        generatedUrls.current.push(...Object.values(urls).filter((url) => url.startsWith("blob:")));
        setAssetUrls(urls);
        loadProject(result.project);
        setSavedProject(result.project);
        setHydrated(true);
        setSaveStatus(result.migrated ? "已恢复旧版图片项目" : "已保存到本机");
      } catch (error) {
        setSaveStatus("本机项目读取失败");
        notify(error instanceof Error ? error.message : "本机项目读取失败，请检查浏览器存储。");
      }
    })();
    return () => { active = false; generatedUrls.current.forEach(URL.revokeObjectURL); generatedUrls.current = []; };
  }, [loadProject, notify]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      saveProject(project).then(() => { setSavedProject(project); setSaveStatus("已保存到本机"); })
        .catch(() => { setSaveStatus("保存失败"); notify("本机保存失败。请检查浏览器存储空间或隐私设置。"); });
    }, 450);
    return () => clearTimeout(timer);
  }, [project, hydrated, notify]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = document.activeElement;
      const editingField = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
      if (editingField) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); removeObject(selectedId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, removeObject]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!hydrated) { notify("项目尚未完成加载，请稍后重试。"); return; }
    if (file.type !== "image/png" && file.type !== "image/jpeg") { notify("只支持 PNG 或 JPG 图片。"); return; }
    if (file.size > MAX_UPLOAD_BYTES) { notify("图片超过 10 MB，请压缩后重试。"); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (width > 8192 || height > 8192 || width * height > 32_000_000) throw new Error("图片尺寸过大，请使用小于 8192 px 且低于 3200 万像素的图片。");
      const id = crypto.randomUUID();
      await saveAssetBlob(id, file);
      const asset: AssetMeta = { id, name: file.name, mime: file.type, source: "upload", naturalWidth: width, naturalHeight: height };
      const url = URL.createObjectURL(file);
      generatedUrls.current.push(url);
      setAssetUrls((previous) => ({ ...previous, [id]: url }));
      addAssetObject(asset, Math.min(52, 45 * width / height), Math.min(65, 45 * height / width));
      notify(`${file.name} 已添加到${FACE_LABELS[useProjectStore.getState().project.selectedFace]}。`);
    } catch (error) { notify(error instanceof Error ? error.message : "图片上传失败，请更换文件后重试。"); }
  };

  const exportFace = (format: "png" | "jpeg") => {
    try {
      const dataUrl = surfaceRef.current?.exportFace(project.selectedFace, format);
      if (!dataUrl?.startsWith("data:image/")) throw new Error("图片尚未准备好，请稍后重试。");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `包装设计-${project.selectedFace}-展示图.${format === "png" ? "png" : "jpg"}`;
      document.body.append(link);
      link.click();
      link.remove();
      notify(`${FACE_LABELS[project.selectedFace]}展示图已导出。`);
    } catch (error) { notify(error instanceof Error ? error.message : "导出失败，请重试。"); }
  };

  const issues = useMemo(() => runPreflight(project, hydrated ? new Set(Object.keys(assetUrls)) : undefined), [project, assetUrls, hydrated]);
  const exportPdf = async () => {
    if (exporting || !hydrated) return;
    setExporting(true);
    try {
      const renderFace = surfaceRef.current?.renderPrintFace;
      if (!renderFace) throw new Error("刀板画布尚未准备好，请稍后重试。");
      const bytes = await buildProofPdf(project, exportSettings, renderFace, new Set(Object.keys(assetUrls)));
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `FOLDORA-${project.dimensions.widthMm}x${project.dimensions.depthMm}x${project.dimensions.heightMm}-RGB校样.pdf`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      notify("完整刀板 RGB 校样 PDF 已导出。");
    } catch (error) { notify(error instanceof Error ? error.message : "PDF 导出失败。"); }
    finally { setExporting(false); }
  };

  const onSurfaces = useCallback((next: SurfaceMap, thumbs: PreviewMap) => { setSurfaces(next); setPreviews(thumbs); }, []);
  return <div className="editor-shell">
    <header className="editor-header">
      <div className="header-brand"><Link href="/" className="brand-symbol" title="返回首页">▧</Link><div><strong>FOLDORA 包装设计</strong><small>专业包装基础版 · v0.2</small></div></div>
      <div className="header-center"><span className="document-name">未命名包装设计</span><span className="template-chip">{project.dimensions.widthMm} × {project.dimensions.depthMm} × {project.dimensions.heightMm} mm</span></div>
      <div className="header-actions"><span className="save-status" role="status">{hydrated && savedProject !== project && saveStatus !== "保存失败" ? "正在保存到本机…" : saveStatus}</span>
        <button type="button" title="撤销 Cmd/Ctrl+Z" disabled={!past.length} onClick={undo}>↶</button>
        <button type="button" title="重做 Cmd/Ctrl+Shift+Z" disabled={!future.length} onClick={redo}>↷</button>
        <button type="button" className="export-button" title="导出当前盒面的 PNG 展示图" onClick={() => exportFace("png")}>导出 PNG</button>
        <button type="button" className="export-secondary" title="导出当前盒面的 JPG 展示图" onClick={() => exportFace("jpeg")}>JPG</button>
        <button type="button" className="export-button" title="导出完整刀板 RGB 校样 PDF" disabled={exporting || !hydrated} onClick={() => void exportPdf()}>{exporting ? "正在导出…" : "导出刀板 PDF"}</button>
      </div>
    </header>
    <div className="editor-grid">
      <aside className="left-sidebar" aria-label="设计工具和刀板">
        <section><span className="eyebrow">TOOLS</span><h2>添加到盒面</h2>
          <div className="tool-grid"><button type="button" title="添加文字" onClick={addText}><b>T</b><span>文字</span></button>
            <button type="button" title="上传 PNG/JPG 图片" onClick={() => uploadRef.current?.click()}><b>▧</b><span>上传图片</span></button></div>
          <input ref={uploadRef} className="visually-hidden" type="file" accept="image/png,image/jpeg" aria-label="上传图片"
            onChange={(event) => { void handleUpload(event.target.files?.[0]); event.target.value = ""; }} />
        </section>
        <section><span className="eyebrow">ASSET LIBRARY</span><h2>基础素材</h2>
          <div className="asset-grid">{Object.values(BUILTIN_ASSETS).map((asset) => <button type="button" key={asset.id}
            title={`添加${asset.name}`} onClick={() => addAssetObject(asset)}>
            {/* Local trusted SVG assets only. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.path} alt="" /><span>{asset.name}</span></button>)}</div>
        </section>
        <DimensionsPanel key={JSON.stringify(project.dimensions)} onError={notify} />
        <section><span className="eyebrow">PRINT GUIDES</span><h2>印刷辅助线</h2>
          <div className="dimension-grid"><label className="property-field">出血 · mm<input type="number" min="0" max="10" step=".5"
            value={project.print.bleedMm} onChange={(event) => { try { updatePrint({ bleedMm: Number(event.target.value) }); } catch (error) { notify(String(error)); } }} /></label>
            <label className="property-field">安全距离 · mm<input type="number" min="0" max="20" step=".5"
              value={project.print.safeAreaMm} onChange={(event) => { try { updatePrint({ safeAreaMm: Number(event.target.value) }); } catch (error) { notify(String(error)); } }} /></label></div>
          <div className="guide-switches"><label><input type="checkbox" checked={showBleed} onChange={(event) => setShowBleed(event.target.checked)} /> 显示 BLEED</label>
            <label><input type="checkbox" checked={showSafe} onChange={(event) => setShowSafe(event.target.checked)} /> 显示 SAFE</label></div>
          <p className="small-note">刀线与压痕始终显示；辅助线开关只影响编辑视图。</p>
        </section>
        <section><span className="eyebrow">EXPORT</span><h2>RGB 校样 PDF</h2>
          <label className="property-field">渲染分辨率<select value={exportSettings.dpi} onChange={(event) =>
            setExportSettings((previous) => ({ ...previous, dpi: Number(event.target.value) as 150 | 300 }))}>
            <option value="300">300 DPI · 默认</option><option value="150">150 DPI · 草稿</option></select></label>
          <div className="guide-switches">{(["includeBleed", "includeCut", "includeCrease"] as const).map((key) => <label key={key}>
            <input type="checkbox" checked={exportSettings[key]} onChange={(event) => setExportSettings((previous) => ({ ...previous, [key]: event.target.checked }))} />
            {key === "includeBleed" ? "出血" : key === "includeCut" ? "CUT" : "CREASE"}</label>)}</div>
          <p className="small-note">完整刀板按实际毫米尺寸导出；这是 RGB 校样，非 PDF/X 印厂认证文件。</p>
        </section>
        <section><span className="eyebrow">DIELINE</span><h2>刀板总览</h2><NetOverview previews={previews} showBleed={showBleed} showSafe={showSafe} />
          <div className="face-picker">{EDITABLE_FACES.map((face) => <button type="button" key={face}
            className={project.selectedFace === face ? "active" : ""} onClick={() => setFace(face)} title={`编辑${FACE_LABELS[face]}`}>
            {FACE_LABELS[face]}<small>{project.faces[face].length}</small></button>)}</div>
          <p className="small-note">底部锁底为结构预览；刀线与压痕线不可选。</p>
        </section>
        <button type="button" className="clear-button" onClick={() => { if (window.confirm("清空本机当前设计？此操作可以撤销。")) clear(); }}>清空当前设计</button>
      </aside>
      <main className="main-workspace">
        <div className="workspace-heading"><div><span className="eyebrow">REFERENCE TEMPLATE / SNAP LOCK</span><h1>包装编辑器</h1></div>
          <div className="view-toggle" role="tablist" aria-label="工作区视图">
            <button type="button" role="tab" aria-selected={activeView === "two"} className={activeView === "two" ? "active" : ""} onClick={() => setActiveView("two")}>2D 设计</button>
            <button type="button" role="tab" aria-selected={activeView === "three"} className={activeView === "three" ? "active" : ""} onClick={() => setActiveView("three")}>3D 预览</button>
          </div>
        </div>
        <div className="workspace-body">{activeView === "two"
          ? <ViewCanvas assetUrls={assetUrls} onAssetError={notify} showBleed={showBleed} showSafe={showSafe} />
          : <BoxPreview surfaces={surfaces} onSelectFace={setFace} onError={notify} />}</div>
        <div className="workspace-footer"><span>插接式锁底盒 · {project.dimensions.widthMm} × {project.dimensions.depthMm} × {project.dimensions.heightMm} mm · 糊口 {project.dimensions.glueFlapMm} mm</span><span>PNG/JPG 展示图 · PDF RGB 校样</span></div>
      </main>
      <aside className="right-sidebar" aria-label="属性、图层和印前检查"><Inspector /><LayersPanel />
        <PreflightPanel issues={issues} onLocate={(issue) => { if (issue.faceId) { setFace(issue.faceId); selectObject(issue.objectId ?? null); setActiveView("two"); } }} />
      </aside>
    </div>
    <TextureSurfaces ref={surfaceRef} assetUrls={assetUrls} onSurfaces={onSurfaces} onAssetError={notify} />
    {toast && <div className="toast" role="alert"><span>{toast}</span><button type="button" onClick={() => setToast(null)} aria-label="关闭提示">×</button></div>}
    <div className="mobile-notice">v0.2 编辑器为桌面设计。请使用宽度至少 1000 px 的电脑浏览器编辑。</div>
  </div>;
}
