import Link from "next/link";

export default function Home() {
  return <main className="landing">
    <div className="landing-card">
      <span className="eyebrow">FOLDORA / PROFESSIONAL PACKAGING FOUNDATION / v0.2</span>
      <div className="landing-mark" aria-hidden="true">▧</div>
      <h1>从平面刀板，到立体包装。</h1>
      <p>设置真实盒型尺寸，设计五个盒面，查看展开与折叠结构，完成印前检查并导出完整刀板 RGB 校样 PDF。</p>
      <Link className="primary-link" href="/editor">打开编辑器 <span aria-hidden="true">↗</span></Link>
      <div className="landing-meta"><span>参数化插接式锁底盒</span><span>本机自动保存</span><span>完整刀板 PDF</span></div>
    </div>
  </main>;
}
