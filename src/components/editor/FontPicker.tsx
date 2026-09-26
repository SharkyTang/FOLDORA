"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureFontLoaded } from "@/core/fonts/loader";
import { FONT_REGISTRY, LEGACY_FONTS, getFont, type FontCategory } from "@/core/fonts/registry";

const CATEGORIES: ("全部" | FontCategory)[] = [
  "全部", "中文无衬线", "中文衬线", "中文创意", "Sans Serif", "Serif", "Display", "Handwriting", "Monospace / Tech",
];

export function FontPicker({ value, text, onChange }: { value: string; text: string; onChange: (fontId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("全部");
  const [hovered, setHovered] = useState<string | null>(null);
  const [loadedPreview, setLoadedPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = getFont(value);
  const sample = text.trim() || "Aa 包装设计 Packaging 123";
  const filtered = useMemo(() => FONT_REGISTRY.filter((font) =>
    (category === "全部" || font.category === category) &&
    `${font.label} ${font.family}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [category, query]);

  useEffect(() => {
    if (!open || !hovered) return;
    const timer = setTimeout(() => {
      setLoading(hovered);
      void ensureFontLoaded(hovered, sample).then(() => { setLoadedPreview(hovered); setError(null); })
        .catch((failure) => setError(failure instanceof Error ? failure.message : "字体预览失败。"))
        .finally(() => setLoading((old) => old === hovered ? null : old));
    }, 180);
    return () => clearTimeout(timer);
  }, [hovered, open, sample]);

  const choose = async (fontId: string) => {
    setLoading(fontId);
    setError(null);
    try {
      await ensureFontLoaded(fontId, sample);
      onChange(fontId);
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "字体加载失败。");
    } finally { setLoading(null); }
  };

  return <div className="font-picker">
    <button type="button" className="font-picker-trigger" aria-expanded={open} aria-label="选择字体"
      onClick={() => setOpen((state) => !state)}>{current?.label ?? value}<span aria-hidden="true">⌄</span></button>
    {open && <div className="font-picker-panel" role="dialog" aria-label="选择字体">
      <div className="font-picker-search"><input autoFocus type="search" aria-label="搜索字体" placeholder="搜索字体"
        value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" aria-label="关闭字体选择" onClick={() => setOpen(false)}>×</button></div>
      <div className="font-picker-categories" role="group" aria-label="字体分类">
        {CATEGORIES.map((item) => <button key={item} type="button" className={category === item ? "active" : ""}
          onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      {current?.legacy && <p className="font-picker-legacy">当前为旧项目系统字体。印刷导出前请选择内置字体。</p>}
      <div className="font-picker-list">
        {filtered.map((font) => <button key={font.id} type="button" className={`font-option ${value === font.id ? "selected" : ""}`}
          onMouseEnter={() => setHovered(font.id)} onFocus={() => setHovered(font.id)}
          onClick={() => void choose(font.id)}>
          <span><strong>{font.label}</strong><small>{font.category} · {font.scripts.includes("chinese") ? "中英" : "西文，中文回退思源黑体"}</small></span>
          <span className="font-option-sample" style={{ fontFamily: loadedPreview === font.id ? `"${font.family}"` : undefined }}>
            {sample.slice(0, 32)}
          </span>
          {loading === font.id && <small>加载中…</small>}
        </button>)}
        {!filtered.length && <p className="empty-note">没有找到匹配字体。</p>}
      </div>
      {error && <p className="font-picker-error" role="alert">{error}</p>}
      <p className="font-picker-count">{FONT_REGISTRY.length} 款内置字体 · {LEGACY_FONTS.length} 款旧项目兼容字体</p>
    </div>}
  </div>;
}
