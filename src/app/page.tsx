import Link from "next/link";

export default function Home() {
  return <main className="landing">
    <div className="landing-card">
      <span className="eyebrow">PACKAGING DESIGN PLATFORM / v0.1</span>
      <div className="landing-mark" aria-hidden="true">▧</div>
      <h1>从平面刀板，到立体包装。</h1>
      <p>使用固定的 90 × 90 × 235 mm 酒盒模板，添加文字与素材，实时预览 3D 纸盒，并导出展示图片。</p>
      <Link className="primary-link" href="/editor">打开编辑器 <span aria-hidden="true">↗</span></Link>
      <div className="landing-meta"><span>固定酒盒刀板</span><span>本机自动保存</span><span>PNG / JPG 展示导出</span></div>
    </div>
  </main>;
}
