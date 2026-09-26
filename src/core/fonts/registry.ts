export type FontCategory = "中文无衬线" | "中文衬线" | "中文创意" | "Sans Serif" | "Serif" | "Display" | "Handwriting" | "Monospace / Tech";
export type FontDefinition = {
  id: string;
  label: string;
  family: string;
  category: FontCategory;
  scripts: readonly ("latin" | "chinese")[];
  weights: readonly number[];
  italic: boolean;
  source: string;
  license: string;
  legacy?: boolean;
};

const font = (id: string, label: string, family: string, category: FontCategory,
  scripts: FontDefinition["scripts"], weights: number[], italic: boolean, source: string): FontDefinition =>
  ({ id, label, family, category, scripts, weights, italic, source, license: "OFL-1.1" });

export const FONT_REGISTRY: readonly FontDefinition[] = [
  font("noto-sans-sc", "思源黑体 · Noto Sans SC", "Noto Sans SC", "中文无衬线", ["chinese", "latin"], [400, 700], false, "@fontsource/noto-sans-sc"),
  font("noto-serif-sc", "思源宋体 · Noto Serif SC", "Noto Serif SC", "中文衬线", ["chinese", "latin"], [400, 700], false, "@fontsource/noto-serif-sc"),
  font("lxgw-wenkai", "霞鹜文楷 · LXGW WenKai", "LXGW WenKai", "中文创意", ["chinese", "latin"], [400, 700], false, "lxgw-wenkai-webfont"),
  font("ma-shan-zheng", "马善政毛笔 · Ma Shan Zheng", "Ma Shan Zheng", "中文创意", ["chinese", "latin"], [400], false, "@fontsource/ma-shan-zheng"),
  font("long-cang", "龙藏体 · Long Cang", "Long Cang", "中文创意", ["chinese", "latin"], [400], false, "@fontsource/long-cang"),
  font("zhi-mang-xing", "志莽行书 · Zhi Mang Xing", "Zhi Mang Xing", "中文创意", ["chinese", "latin"], [400], false, "@fontsource/zhi-mang-xing"),
  font("inter", "Inter", "Inter", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/inter"),
  font("roboto", "Roboto", "Roboto", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/roboto"),
  font("open-sans", "Open Sans", "Open Sans", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/open-sans"),
  font("montserrat", "Montserrat", "Montserrat", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/montserrat"),
  font("poppins", "Poppins", "Poppins", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/poppins"),
  font("dm-sans", "DM Sans", "DM Sans", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/dm-sans"),
  font("space-grotesk", "Space Grotesk", "Space Grotesk", "Sans Serif", ["latin"], [400, 700], false, "@fontsource/space-grotesk"),
  font("nunito", "Nunito", "Nunito", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/nunito"),
  font("raleway", "Raleway", "Raleway", "Sans Serif", ["latin"], [400, 700], true, "@fontsource/raleway"),
  font("playfair-display", "Playfair Display", "Playfair Display", "Serif", ["latin"], [400, 700], true, "@fontsource/playfair-display"),
  font("lora", "Lora", "Lora", "Serif", ["latin"], [400, 700], true, "@fontsource/lora"),
  font("merriweather", "Merriweather", "Merriweather", "Serif", ["latin"], [400, 700], true, "@fontsource/merriweather"),
  font("libre-baskerville", "Libre Baskerville", "Libre Baskerville", "Serif", ["latin"], [400, 700], true, "@fontsource/libre-baskerville"),
  font("cormorant-garamond", "Cormorant Garamond", "Cormorant Garamond", "Serif", ["latin"], [400, 700], true, "@fontsource/cormorant-garamond"),
  font("bebas-neue", "Bebas Neue", "Bebas Neue", "Display", ["latin"], [400], false, "@fontsource/bebas-neue"),
  font("oswald", "Oswald", "Oswald", "Display", ["latin"], [400, 700], false, "@fontsource/oswald"),
  font("anton", "Anton", "Anton", "Display", ["latin"], [400], false, "@fontsource/anton"),
  font("archivo-black", "Archivo Black", "Archivo Black", "Display", ["latin"], [400], false, "@fontsource/archivo-black"),
  font("caveat", "Caveat", "Caveat", "Handwriting", ["latin"], [400, 700], false, "@fontsource/caveat"),
  font("dancing-script", "Dancing Script", "Dancing Script", "Handwriting", ["latin"], [400, 700], false, "@fontsource/dancing-script"),
  font("pacifico", "Pacifico", "Pacifico", "Handwriting", ["latin"], [400], false, "@fontsource/pacifico"),
  font("great-vibes", "Great Vibes", "Great Vibes", "Handwriting", ["latin"], [400], false, "@fontsource/great-vibes"),
  font("jetbrains-mono", "JetBrains Mono", "JetBrains Mono", "Monospace / Tech", ["latin"], [400, 700], true, "@fontsource/jetbrains-mono"),
  font("space-mono", "Space Mono", "Space Mono", "Monospace / Tech", ["latin"], [400, 700], true, "@fontsource/space-mono"),
] as const;

export const LEGACY_FONTS: readonly FontDefinition[] = [
  { id: "legacy-arial", label: "Arial · 旧项目系统字体", family: "Arial", category: "Sans Serif", scripts: ["latin"], weights: [400, 700], italic: true, source: "system", license: "system", legacy: true },
  { id: "legacy-georgia", label: "Georgia · 旧项目系统字体", family: "Georgia", category: "Serif", scripts: ["latin"], weights: [400, 700], italic: true, source: "system", license: "system", legacy: true },
  { id: "legacy-times", label: "Times New Roman · 旧项目系统字体", family: "Times New Roman", category: "Serif", scripts: ["latin"], weights: [400, 700], italic: true, source: "system", license: "system", legacy: true },
  { id: "legacy-pingfang", label: "苹方 · 旧项目系统字体", family: "PingFang SC", category: "中文无衬线", scripts: ["chinese", "latin"], weights: [400, 700], italic: false, source: "system", license: "system", legacy: true },
  { id: "legacy-yahei", label: "微软雅黑 · 旧项目系统字体", family: "Microsoft YaHei", category: "中文无衬线", scripts: ["chinese", "latin"], weights: [400, 700], italic: false, source: "system", license: "system", legacy: true },
];

const BY_ID = new Map([...FONT_REGISTRY, ...LEGACY_FONTS].map((item) => [item.id, item]));
const LEGACY_BY_FAMILY = new Map(LEGACY_FONTS.map((item) => [item.family, item.id]));

export function getFont(fontId: string): FontDefinition | undefined { return BY_ID.get(fontId); }
export function legacyFontId(family: string): string | undefined { return LEGACY_BY_FAMILY.get(family); }
export function hasChinese(text: string): boolean { return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text); }
export function resolvedWeight(font: FontDefinition, requested: number): number {
  return font.weights.reduce((best, weight) => Math.abs(weight - requested) < Math.abs(best - requested) ? weight : best, font.weights[0]);
}
export function canvasFontFamily(fontId: string, text: string): string {
  const definition = getFont(fontId);
  if (!definition) return '"Noto Sans SC"';
  return hasChinese(text) && !definition.scripts.includes("chinese")
    ? `"${definition.family}", "Noto Sans SC"` : `"${definition.family}"`;
}
