import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOLDORA 包装设计 · v0.3",
  description: "可自绘刀板的 2D 设计、折叠 3D 预览、印前检查与 RGB 校样导出。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
