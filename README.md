# 包装设计平台 v0.1

固定盒型的本机包装设计编辑器。盒身为 90 × 90 × 235 mm，糊口 15 mm。当前版本只支持这一种盒型；正、背、左、右、顶面可编辑，底部展示结构。

## 运行

需要 Node.js 20.9 或更新版本。在仓库目录执行：

```bash
npm ci
npm run dev
```

在桌面浏览器打开 <http://localhost:4187/editor>。根路径是进入编辑器的项目首页。数据保存在当前浏览器的 IndexedDB，换浏览器或清除站点数据不会保留设计。

## 编辑

- 左侧可切换盒面、查看刀板总览、添加预置 SVG、上传 PNG/JPG 图片；图片最大 10 MB。
- 中央使用 2D 画布编辑当前面，可拖动、缩放和旋转文字或图片；切换到 3D 后可旋转、缩放、点击选面并用按钮聚焦盒面。
- 右侧可修改文字、颜色、尺寸、位置、旋转、透明度，以及选择、显隐、锁定、排序或删除图层。
- 顶部提供撤销／重做和当前盒面 PNG/JPG 展示图导出。常用快捷键：⌘/Ctrl+Z 撤销、⌘/Ctrl+Shift+Z 或 Ctrl+Y 重做、Delete/Backspace 删除选中对象。
- 修改自动保存；刷新页面会恢复设计。首次在同一浏览器来源打开时，会尝试把旧版 `diecut-preview` 的单图贴面记录迁移为图片对象。旧记录不会被删除。

刀板 CUT 为实线、CREASE 为虚线，结构线不可选。2D、3D 和导出共用项目对象数据及同一盒面渲染。

## 验证与构建

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

端到端测试使用 Playwright Chromium；首次运行需安装浏览器：`npx playwright install chromium --no-shell`。如果编辑器已运行在 4187 端口，可执行 `E2E_BASE_URL=http://localhost:4187 npm run test:e2e`。生产构建和开发服务共用 `.next` 目录；运行 `npm run build` 后请重启开发服务再测试。

## 文件与限制

- `src/core/box/reference.ts`：固定刀板几何。
- `src/core/project/`：版本化项目、历史记录、IndexedDB 保存与旧数据迁移。
- `src/components/editor/`：编辑画布、刀板总览、3D 预览、贴图渲染、属性与图层。
- `docs/legacy-prototype/`：原生 HTML/JS 原型备份。
- `docs/Packaging_Platform_v0.1_Handoff.md`：交接、验收和限制说明。

未标注的盖舌和锁底轮廓沿用参考图描绘。当前 PNG/JPG 是单个盒面的展示图，**不作为印刷生产文件或刀模**。v0.1 不含参数化盒型、云端账号、协作和印刷级导出。
