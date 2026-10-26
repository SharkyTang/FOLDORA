# FOLDORA

**从平面刀板，到立体包装。**

FOLDORA 是一个在本机运行、面向桌面浏览器的包装设计编辑器。你可以从参数化盒型开始，也可以绘制自己的刀板，为各个面板添加文字和图案，查看 3D 折叠效果，最后导出图像或完整刀板 RGB 校样 PDF。

当前仓库版本：**v0.3 · Custom Dieline Foundation**。

[快速开始](#快速开始) · [主要功能](#主要功能) · [使用流程](#使用流程) · [开发与验证](#开发与验证) · [已知限制](#已知限制)

## 主要功能

| 能力 | 当前支持 |
| --- | --- |
| 参数化盒型 | 插接式锁底盒模板，按毫米设置宽、深、高和粘口 |
| 自绘刀板 | 从空白或模板副本开始，绘制 CUT 外轮廓、开孔、刀线、CREASE 压痕和辅助线 |
| 精细编辑 | 矩形、椭圆、贝塞尔曲线，节点与控制柄编辑，毫米坐标及网格吸附 |
| 面板设计 | 面板识别与确认，文字、30 款字体、内置 SVG 图案及 PNG/JPG 图片 |
| 3D 预览 | 0–100% 折叠进度、播放、旋转、平移和缩放 |
| 项目管理 | 本机多项目、新建、复制、重命名、切换、删除、撤销与重做 |
| 保存与备份 | 浏览器自动保存，下载和导入包含上传图片的 `.foldora` 项目备份 |
| 检查与导出 | 印前检查、当前面 PNG/JPG、完整刀板 RGB 校样 PDF |

## 快速开始

需要 **Node.js 20.9+**、npm，以及支持 Canvas 和 WebGL 的现代桌面浏览器。

```bash
git clone https://github.com/SharkyTang/FOLDORA.git
cd FOLDORA
npm ci
npm run dev
```

打开 [http://localhost:4187/editor](http://localhost:4187/editor) 进入编辑器，或访问 [首页](http://localhost:4187/)。

本机运行生产构建：

```bash
npm run build
npm start
```

当前 v0.3 不需要配置数据库、账号或 API 密钥。

## 使用流程

1. **选择起点**：使用默认盒型，或从“项目”菜单新建空白刀板、复制模板为自绘刀板。
2. **确定结构**：调整模板尺寸；自绘项目则绘制轮廓和压痕，再点击“识别并确认面板”。
3. **设计面板**：选择可印刷面板，添加文字、内置图案或自己的图片，调整位置、颜色和图层。
4. **查看折叠**：在 3D 预览中拖动折叠进度，检查展开、半折与合盒效果。
5. **检查与导出**：查看印前问题，导出当前面 PNG/JPG，或完整刀板 RGB 校样 PDF。
6. **保留源文件**：从“项目”菜单下载 `.foldora` 备份，方便后续继续编辑。

模板尺寸范围：宽、深各 **40–200 mm**，高 **80–400 mm**；粘口 **5–30 mm**，且不超过较小侧宽的三分之一。点击“更新刀板”后统一应用。尺寸变化保留图案原有的毫米坐标，超出面板的对象会由印前检查提示。

自绘项目允许保存未完成的结构草稿；需要修复影响结构的问题并确认面板后，才能使用对应的 3D 预览和完整刀板 PDF 导出。

## 导出与数据保存

| 格式 | 用途与边界 |
| --- | --- |
| PNG / JPG | 导出当前面图案，按现有 1200 px 规则输出 |
| RGB 校样 PDF | 页面按毫米尺寸生成；图案默认 300 DPI、草稿 150 DPI；刀线、压痕和开孔保留矢量 |
| `.foldora` | 可继续编辑的项目备份，包含项目数据和上传图片；导入时创建新项目 |

项目保存在当前浏览器的 **IndexedDB** 中。请使用固定的浏览器和访问地址；`localhost` 与 `127.0.0.1` 的数据互相独立。清理站点数据或更换设备不会自动同步作品，建议定期下载备份。

现有 v2/v3 项目会迁移到 v4，并在同一存储事务中保留升级前记录；旧 `diecut-preview` 数据库保留。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 应用 | Next.js 16 App Router、React 19、TypeScript |
| 2D 编辑 | Konva、React Konva |
| 3D 预览 | Three.js、React Three Fiber、Drei |
| 状态与存储 | Zustand、IndexedDB / idb |
| 几何与输出 | clipper2-ts、svg-path-properties、pdf-lib |
| 验证工具 | Node.js Test Runner、Playwright、ESLint、TypeScript |

## 开发与验证

```bash
npm test              # 几何、项目和相关逻辑测试
npm run typecheck     # TypeScript 类型检查
npm run lint          # ESLint 检查
npm run build         # 生产构建
```

浏览器端测试使用 Playwright Chromium，首次使用先安装浏览器：

```bash
npx playwright install chromium
npm run test:e2e
```

默认测试服务使用 `127.0.0.1:4189`。如需连接已启动的独立生产预览，先完成构建，在一个终端启动服务：

```bash
npx next start -p 4190 -H 127.0.0.1
```

再在另一个终端运行：

```bash
E2E_BASE_URL=http://127.0.0.1:4190 npm run test:e2e
```

### 目录结构

```text
src/
├── app/                  # 首页与编辑器入口
├── components/editor/    # 2D、刀板编辑、属性面板和 3D 视图
└── core/
    ├── box/              # 模板几何、自绘路径、面板识别与折叠检查
    ├── fonts/            # 字体注册与加载
    ├── print/            # 印前检查与 PDF 合成
    └── project/          # 项目模型、状态、迁移、存储与备份
tests/                    # 逻辑测试与历史几何夹具
e2e/                      # 浏览器流程测试
public/assets/            # 内置 SVG 图案
docs/                     # 版本交接与历史原型
```

## 已知限制

- 当前版本面向桌面浏览器，3D 预览需要 WebGL。
- 自绘结构支持单张连通纸板、直线铰链和无闭环折叠；暂未提供曲面折叠、纸厚物理模拟或跨面连续图案。
- 暂未提供 SVG/DXF 刀板导入或自由手绘；内置 SVG 图案与刀板文件导入属于不同能力。
- 自绘开放 CUT 刀线在 3D 中仅显示线条标记，尚不会把纸板切出实体缝隙。
- 自行上传的面板图片限 PNG/JPG，单张最大 10 MB。
- PDF 为 **RGB 校样**，未提供 CMYK、ICC 色彩管理或 PDF/X 输出。结构预览与校样不能代替实物打样，纸材、厚度和工艺公差仍需校核。
- 用户项目保存在本机浏览器，当前版本没有账号系统或跨设备同步。

## 开发方向

项目正在探索从包装结构编辑转向**可编辑设计素材库**：由管理员整理和配置素材，用户在独立副本中修改、组合、保存和导出。素材库与管理后台尚未包含在当前 GitHub v0.3 代码中；本 README 的启动方式与功能说明对应已上传版本。

## 项目文档

- [v0.3：自绘刀板、兼容与验收交接](docs/Packaging_Platform_v0.3_Handoff.md)
- [v0.2：包装编辑工作流交接](docs/Packaging_Platform_v0.2_Handoff.md)
- [v0.1：初始版本交接](docs/Packaging_Platform_v0.1_Handoff.md)
- [历史静态原型](docs/legacy-prototype/)
