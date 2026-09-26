import Link from "next/link";

export default function Home() {
  return <main className="landing">
    <div className="landing-card">
      <span className="eyebrow">FOLDORA / CUSTOM DIELINE FOUNDATION / v0.3</span>
      <div className="landing-mark" aria-hidden="true">▧</div>
      <h1>从平面刀板，到立体包装。</h1>
      <p>从参数化盒型或空白刀板开始，绘制结构并设计面板，查看折叠效果，完成印前检查并导出完整刀板 RGB 校样 PDF。</p>
      <Link className="primary-link" href="/editor">打开编辑器 <span aria-hidden="true">↗</span></Link>
      <div className="landing-meta"><span>模板与自绘刀板</span><span>本机多项目与备份</span><span>完整刀板 PDF</span></div>
    </div>
  </main>;
}
