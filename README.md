# FOLDORA v0.2

本机运行的桌面包装编辑器。当前支持参数化插接式锁底盒：设置宽、深、高与糊口，设计正、背、左、右、顶五个盒面，在 2D 刀板和可折叠 3D 模型中查看结果，完成印前检查，导出完整刀板 RGB 校样 PDF。

## 运行

需要 Node.js 20.9 或更新版本：

```bash
npm ci
npm run dev
```

在桌面浏览器打开 <http://localhost:4187/editor>。项目和上传图片保存在当前浏览器的 IndexedDB；请勿清除站点数据或用无痕模式保存正式设计。

## 工作流程

1. 在左侧输入 W、D、H、Glue 后点击“更新刀板”。支持 W/D 40–200 mm、H 80–400 mm、Glue 5–30 mm，并要求 Glue 不超过较小侧宽的三分之一。更改尺寸会作为一次撤销记录，已有图案保留绝对 mm 坐标。
2. 切换五个盒面，添加文字、内置 SVG 素材或 PNG/JPG 图片。文字可从 30 款内置字体中搜索、预览并选择，也可设置字重、斜体、字距和行距。图片最大 10 MB。
3. 刀板总览始终显示 CUT 实线和 CREASE 虚线。BLEED 和 SAFE 默认各 3 mm，可调整距离和显示开关；显示开关不写入项目内容。
4. 在 3D 预览中用滑杆查看 0–100% 折叠过程，或选择展开、半折、合盒和播放。点击盒面会先合盒再聚焦。
5. 右侧“印前检查”定位越界、低 DPI、缺失素材及字体问题。阻止项修复后，导出完整刀板 PDF；默认 300 DPI，150 DPI 为草稿。可选择是否包含 BLEED、CUT、CREASE。PDF 另外留有 2 mm 页面边距，避免辅助线被裁切。

顶部 PNG/JPG 按 1200 px 导出当前盒面展示图。PDF 包含五个盒面的位图图案、空白结构折片、矢量 CUT／CREASE 及出血线。导出文件是 **RGB 校样**，未进行 CMYK、ICC、PDF/X 或印厂认证处理；未编辑折片不会获得延伸图案。

支持 ⌘/Ctrl+Z 撤销、⌘/Ctrl+Shift+Z 或 Ctrl+Y 重做，以及 Delete/Backspace 删除选中对象。修改自动保存，刷新后恢复。v2 项目第一次打开时先在同一 IndexedDB 事务中备份原始记录，再迁移到 v3；旧 `diecut-preview` 记录继续保留。旧项目系统字体需要从内置字体库重新选择，才能导出 PDF。

## 验证

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

端到端测试使用 Playwright Chromium；首次运行可能需要 `npx playwright install chromium --no-shell`。生产构建与开发服务共用 `.next`，构建后请重启开发服务。独立生产预览可用 `npx next start -p 4190 -H 127.0.0.1`，再执行 `E2E_BASE_URL=http://127.0.0.1:4190 npm run test:e2e`。

## 结构与限制

- `src/core/box/reference.ts` 保存不可变的 v0.1 黄金刀板；`geometry.ts` 按真实尺寸生成面板、折片、轮廓、压痕和辅助线。
- `src/core/fonts/` 是字体注册表与加载器；`src/components/editor/fontStyles.ts` 声明本机 WOFF2 字体。
- `src/core/print/` 进行印前检查和 PDF 合成；`src/core/project/` 维护项目 v3、历史记录和 IndexedDB 迁移。
- `src/components/editor/` 提供五面画布、刀板、折叠模型、属性面板和导出界面。
- `docs/Packaging_Platform_v0.2_Handoff.md` 记录字体来源、几何规则、迁移及验收结果。

折片为结构示意精度，v0.2 只编辑五个盒面。TIFF、第二款盒型、文字描边／阴影及最近字体列为后续增强。账号、云端、AI、CMYK、ICC 与 PDF/X 不在本版范围。
