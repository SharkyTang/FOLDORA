import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOLDORA 包装设计 · v0.2",
  description: "固定酒盒刀板的 2D 设计、实时 3D 预览与展示图导出。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
