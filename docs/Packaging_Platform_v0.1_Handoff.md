# 包装设计平台 v0.1 交接

当前稳定版本：`0.1.0`。以下内容是后续开发的项目基线。

## 范围与运行

本次实现了固定盒型的桌面浏览器编辑器，入口为 `http://localhost:4187/editor`。执行 `npm ci && npm run dev` 启动。生产构建执行 `npm run build`，然后用 `npm run start` 启动。

技术栈：Next.js App Router、React、TypeScript、Konva/react-konva、Three.js/React Three Fiber/Drei、GSAP、Zustand、IndexedDB。旧原型归档在 `docs/legacy-prototype/`，其固定几何移入 `src/core/box/reference.ts`。

主要文件：

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 首页、编辑器入口、全局样式 |
| `src/core/box/reference.ts` | 固定刀板几何 |
| `src/core/project/types.ts` | 项目、对象、素材类型与 mm 单位换算 |
| `src/core/project/store.ts` | 唯一项目状态、图层操作和历史记录 |
| `src/core/project/storage.ts` | IndexedDB、上传素材和旧数据迁移 |
| `src/components/editor/FaceStage.tsx` | 当前面与离屏面共用的 Konva 渲染 |
| `src/components/editor/TextureSurfaces.tsx` | 离屏盒面画布、缩略图、导出 |
| `src/components/editor/BoxPreview.tsx` | Three.js 盒体、贴图与 GSAP 镜头 |
| `src/components/editor/NetOverview.tsx` | 刀板总览与 CUT／CREASE |
| `src/components/editor/Inspector.tsx` | 属性与图层 |
| `src/components/editor/EditorWorkspace.tsx` | 三栏界面和交互串联 |
| `public/assets/` | 本地预置 SVG |
| `tests/`、`e2e/` | 数据与浏览器回归 |

## 已实现

1. **固定结构**：90 × 90 × 235 mm 盒身和 15 mm 糊口；完整刀板总览显示 LEFT／BACK／RIGHT／FRONT、顶盖和锁底。CUT 实线、CREASE 虚线，结构不可选。
2. **2D 设计**：五个可编辑盒面为正、背、左、右、顶。文字、PNG/JPG 上传、四个预置 SVG 素材可添加到当前面。对象支持拖动、缩放、旋转，属性栏支持精确位置和尺寸输入。
3. **图层与历史**：图层选择、显隐、锁定、删除、逐层移动、置顶、置底；撤销／重做及快捷键。
4. **3D 预览**：设计对象渲染到各盒面离屏 Konva 画布，再作为 Three.js 贴图。按帧合并更新，拖动结束立即刷新。支持旋转、缩放、复位，以及按钮或模型点击选面；GSAP 平滑移动镜头，手动控制会打断过渡。
5. **保存与迁移**：版本化项目和上传图片保存在 IndexedDB；刷新后恢复。首次打开时尝试读取旧 `diecut-preview` 数据库，将单图贴面迁移为图片对象；旧库保留。
6. **展示图导出**：使用当前盒面的同一渲染结果生成 1200 px 宽 PNG/JPG，并标明展示用途。上传、保存、贴图及导出异常会在界面提示。

项目数据在 `src/core/project/types.ts` 定义。项目版本为 2，模板 ID 固定为 `snap-lock-90x90x235`；每面维护有序对象数组，数组顺序为层级。对象的位置和尺寸用 mm 保存，素材以 ID 引用。当前选中对象和镜头状态属于界面状态，不进入设计数据。

数据流：Konva 编辑操作更新 Zustand 的 `Project` → 当前面与其他面的 `FaceStage` 读取同一项目 → `TextureSurfaces` 按帧生成发生变化的面画布 → `BoxPreview` 以 `CanvasTexture` 显示 → 导出直接从相同 `FaceStage` 以目标像素宽度渲染。IndexedDB 自动保存该项目与上传文件 Blob。

## 验收与检查

- `npm test`：固定几何及项目数据规则。
- `npm run typecheck`：TypeScript。
- `npm run lint`：ESLint。
- `npm run build`：生产构建。
- `npm run test:e2e`：Playwright Chromium 测试文字与 Logo 编辑、图层操作、RIGHT／FRONT 镜头、2D 到 3D 更新、刷新恢复、PNG/JPG 文件、预置 SVG、撤销／重做及旧数据迁移。

2026-09-26 本机验收结果：4 个单元测试、2 个浏览器测试通过；类型检查、lint、生产构建通过。浏览器截图显示 HELLO 和上传的 Logo 同时出现在正面 2D 画布、刀板缩略图和 3D 正面。浏览器测试还检查了 PNG/JPG 文件头和 PNG 的 1200 px 宽度。

## 已知问题与限制

- 盖舌与锁底局部轮廓在参考图中没有完整尺寸标注，沿用原型描绘。当前导出仅为单面展示图，不是整张刀板或印刷生产文件。
- 数据保存在当前浏览器、当前来源的 IndexedDB；清除站点数据或换设备不会同步。旧数据迁移仅适用于相同浏览器来源。
- 编辑体验按桌面宽度设计；手机端显示桌面编辑提示，未作为完整编辑器验收。
- v0.1 只提供一款固定盒型，不包括参数化盒型、印刷级导出、账号、云存储、AI、会员或社区。
- 当前验收测试中没有发现阻断使用的已知 Bug。开发服务和生产构建共用 `.next` 目录；构建完成后应重启开发服务再做浏览器测试。
- 3D 依赖在开发日志中会输出 `THREE.Clock` 弃用提示；本次浏览器验收中未影响预览或镜头操作。

## v0.2 入口与稳定约束

后续若进入 v0.2，可从多盒型和尺寸参数化需求重新设计模板层，并为版本 2 项目提供明确迁移。此次只保留固定模板 ID，没有预做参数化引擎。

扩展时应保留 v0.1 的固定盒型尺寸与四面顺序、mm 坐标、每面图层顺序、2D／3D 同源渲染、IndexedDB 恢复、旧记录不被迁移覆盖、展示图导出及 10 个验收场景。本次没有实现后续版本功能，也没有推送仓库。
