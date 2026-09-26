"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useProjectStore } from "@/core/project/store";
import { loadAssetUrls, loadOrCreateProject, saveAssetBlob, saveProject } from "@/core/project/storage";
import { BUILTIN_ASSETS, EDITABLE_FACES, FACE_LABELS, faceSize, type AssetMeta, type Project } from "@/core/project/types";
import { BoxPreview } from "./BoxPreview";
import { FaceStage } from "./FaceStage";
import { Inspector, LayersPanel } from "./Inspector";
import { NetOverview } from "./NetOverview";
import { TextureSurfaces, type PreviewMap, type SurfaceHandle, type SurfaceMap } from "./TextureSurfaces";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function ViewCanvas({ assetUrls, onAssetError }: { assetUrls: Record<string, string>; onAssetError: (message: string) => void }) {
  const face = useProjectStore((state) => state.project.selectedFace);
  const [zoom, setZoom] = useState(1);
  const [bounds, setBounds] = useState({ width: 650, height: 650 });
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!holder.current) return;
    const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  const size = faceSize(face);
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
      </div>
    </div>
    <div className="canvas-status">盒面设计区域 · 鼠标拖动对象，拖动控制点缩放或旋转</div>
  </div>;
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

  const onSurfaces = useCallback((next: SurfaceMap, thumbs: PreviewMap) => { setSurfaces(next); setPreviews(thumbs); }, []);
  return <div className="editor-shell">
    <header className="editor-header">
      <div className="header-brand"><Link href="/" className="brand-symbol" title="返回首页">▧</Link><div><strong>包装设计平台</strong><small>固定酒盒模板 · v0.1</small></div></div>
      <div className="header-center"><span className="document-name">未命名包装设计</span><span className="template-chip">90 × 90 × 235 mm</span></div>
      <div className="header-actions"><span className="save-status" role="status">{hydrated && savedProject !== project && saveStatus !== "保存失败" ? "正在保存到本机…" : saveStatus}</span>
        <button type="button" title="撤销 Cmd/Ctrl+Z" disabled={!past.length} onClick={undo}>↶</button>
        <button type="button" title="重做 Cmd/Ctrl+Shift+Z" disabled={!future.length} onClick={redo}>↷</button>
        <button type="button" className="export-button" title="导出当前盒面的 PNG 展示图" onClick={() => exportFace("png")}>导出 PNG</button>
        <button type="button" className="export-secondary" title="导出当前盒面的 JPG 展示图" onClick={() => exportFace("jpeg")}>JPG</button>
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
        <section><span className="eyebrow">DIELINE</span><h2>固定刀板</h2><NetOverview previews={previews} />
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
          ? <ViewCanvas assetUrls={assetUrls} onAssetError={notify} />
          : <BoxPreview surfaces={surfaces} onSelectFace={setFace} onError={notify} />}</div>
        <div className="workspace-footer"><span>固定盒型 · 90 × 90 × 235 mm · 糊口 15 mm</span><span>PNG/JPG 仅作展示，非印刷文件</span></div>
      </main>
      <aside className="right-sidebar" aria-label="属性和图层"><Inspector /><LayersPanel /></aside>
    </div>
    <TextureSurfaces ref={surfaceRef} assetUrls={assetUrls} onSurfaces={onSurfaces} onAssetError={notify} />
    {toast && <div className="toast" role="alert"><span>{toast}</span><button type="button" onClick={() => setToast(null)} aria-label="关闭提示">×</button></div>}
    <div className="mobile-notice">v0.1 编辑器为桌面设计。请使用宽度至少 1000 px 的电脑浏览器编辑；当前仍可查看固定刀板。</div>
  </div>;
}
