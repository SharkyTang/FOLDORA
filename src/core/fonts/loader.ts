import { FONT_REGISTRY, canvasFontFamily, getFont, hasChinese, resolvedWeight } from "./registry";

const pending = new Map<string, Promise<void>>();
const loaded = new Set<string>();

export async function ensureFontLoaded(fontId: string, text = "Aa 包装设计 Packaging 123", weight = 400, italic = false): Promise<void> {
  const definition = getFont(fontId);
  if (!definition || definition.legacy) throw new Error(`字体 ${definition?.label ?? fontId} 无法保证导出一致，请在属性面板更换为内置字体。`);
  if (typeof document === "undefined") return;
  const actualWeight = resolvedWeight(definition, weight);
  const actualItalic = italic && definition.italic;
  const family = canvasFontFamily(fontId, text);
  const key = `${fontId}:${actualWeight}:${actualItalic}:${Array.from(new Set(text)).sort().join("")}`;
  if (loaded.has(key)) return;
  let task = pending.get(key);
  if (!task) {
    task = (async () => {
      const style = `${actualItalic ? "italic" : "normal"} ${actualWeight} 18px ${family}`;
      const faces = await document.fonts.load(style, text || "Aa");
      await document.fonts.ready;
      if (!faces.length || !document.fonts.check(style, text || "Aa")) throw new Error(`字体 ${definition.label} 加载失败，请检查本机网络或更换字体。`);
      if (hasChinese(text) && !definition.scripts.includes("chinese")) {
        const fallback = FONT_REGISTRY[0];
        const fallbackFaces = await document.fonts.load(`normal 400 18px "${fallback.family}"`, text);
        if (!fallbackFaces.length) throw new Error("中文回退字体加载失败，请更换支持中文的字体。");
      }
      loaded.add(key);
    })().finally(() => { pending.delete(key); });
    pending.set(key, task);
  }
  return task;
}

export function resetFontLoaderForTests() { pending.clear(); loaded.clear(); }
