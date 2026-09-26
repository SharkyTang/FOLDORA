# FOLDORA v0.2 交接

## 版本与完成范围

版本 `0.2.0`，模板 `snap-lock-carton`。本机桌面编辑器已实现：尺寸输入与一次性更新、五面图案编辑、0–100% 折叠和闭合 3D 预览、30 款本机字体、真实轮廓辅助线、印前检查、完整刀板 RGB 校样 PDF。原 v0.1 当前盒面 1200 px PNG/JPG、图层、撤销／重做、自动保存和旧 `diecut-preview` 导入继续可用。

P0 已完成；P1 的最近字体、文字描边／阴影、TIFF 和 Straight Tuck End 第二模板未加入本版。它们不影响 v0.2 发布门槛。

## 架构变更

| 模块 | v0.2 职责 |
| --- | --- |
| `src/core/box/geometry.ts` | `BOX_TEMPLATES` 注册表、Snap-lock 生成器、尺寸校验、轮廓偏移与结构完整性检查 |
| `src/core/project/types.ts`、`store.ts` | v3 项目、mm 对象、历史记录、打印设置和尺寸更新 |
| `src/core/project/migration.ts`、`storage.ts` | v2 纯函数迁移、IndexedDB 原件备份、图片 Blob 恢复 |
| `src/core/fonts/` | 唯一字体注册表、旧字体映射、按需加载与导出前等待 |
| `src/core/print/` | 独立印前规则和 PDF 合成器；与编辑器共享几何与盒面对象 |
| `src/components/editor/` | 动态尺寸 2D、展开／折叠 3D、结构辅助线、字体选择、印前定位及导出界面 |

## 盒型与几何

- 尺寸为 `widthMm W`、`depthMm D`、`heightMm H`、`glueFlapMm G`。允许 W/D 40–200 mm、H 80–400 mm、G 5–30 mm，宽深比例 1:2 至 2:1，且 G 不超过较小侧宽三分之一。
- 主体横向排列 `Glue → LEFT(D) → BACK(W) → RIGHT(D) → FRONT(W)`。正背 W×H，左右 D×H，顶面 W×D。面板、折片、CUT 外轮廓和背片开孔、15 条 CREASE、边界由 `src/core/box/geometry.ts` 生成。
- 90×90×235 mm、G15 的轮廓、孔洞、面板、折片局部路径及压痕与独立冻结的 `tests/fixtures/v01-geometry.json` 完全一致。另验证 120×80×200、100×60×180、150×100×250。生成后的外轮廓自交和折片范围冲突由印前检查识别。
- 未标注的折片细部按 v0.1 参考比例逐片构造；它们保留结构示意精度。交付印厂前需要以实际设备、纸张和插接工艺校准刀模。v0.2 的糊口、侧翼、插舌、锁底不可独立编辑图案。
- 刀板总览、五面 2D、折叠 3D、PDF 和印前检查使用同一几何尺寸。更新尺寸不缩放对象的 mm 坐标；越界由印前检查定位。

## 字体来源、授权和覆盖

字体注册表在 `src/core/fonts/registry.ts`。29 款来自对应 `@fontsource/*` npm 包，其元数据标注 OFL-1.1；霞鹜文楷来自 `lxgw-wenkai-webfont`，包内包含 OFL.txt。CSS 由 `src/components/editor/fontStyles.ts` 声明本机 WOFF2 文件；字体文件按浏览器实际使用的字符子集请求。表中“中文”表示本包提供中文字符子集，“西文”表示主要拉丁字符；西文字体遇到中文时显式加载 Noto Sans SC 回退。字符覆盖以实际 WOFF2 的 `unicode-range` 为准，不能据此保证每个罕见字符都有字形。

| 分类 | 字体 | npm 来源 | 字重 | 斜体 | 字符覆盖 | 许可 |
| --- | --- | --- | --- | --- | --- | --- |
| 中文无衬线 | Noto Sans SC | `@fontsource/noto-sans-sc` | 400/700 | 否 | 中文、拉丁 | OFL-1.1 |
| 中文衬线 | Noto Serif SC | `@fontsource/noto-serif-sc` | 400/700 | 否 | 中文、拉丁 | OFL-1.1 |
| 中文创意 | LXGW WenKai | `lxgw-wenkai-webfont` | 400/700 | 否 | 中文、拉丁 | OFL-1.1 |
| 中文创意 | Ma Shan Zheng | `@fontsource/ma-shan-zheng` | 400 | 否 | 中文、拉丁 | OFL-1.1 |
| 中文创意 | Long Cang | `@fontsource/long-cang` | 400 | 否 | 中文、拉丁 | OFL-1.1 |
| 中文创意 | Zhi Mang Xing | `@fontsource/zhi-mang-xing` | 400 | 否 | 中文、拉丁 | OFL-1.1 |
| Sans Serif | Inter | `@fontsource/inter` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | Roboto | `@fontsource/roboto` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | Open Sans | `@fontsource/open-sans` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | Montserrat | `@fontsource/montserrat` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | Poppins | `@fontsource/poppins` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | DM Sans | `@fontsource/dm-sans` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | Space Grotesk | `@fontsource/space-grotesk` | 400/700 | 否 | 西文 | OFL-1.1 |
| Sans Serif | Nunito | `@fontsource/nunito` | 400/700 | 是 | 西文 | OFL-1.1 |
| Sans Serif | Raleway | `@fontsource/raleway` | 400/700 | 是 | 西文 | OFL-1.1 |
| Serif | Playfair Display | `@fontsource/playfair-display` | 400/700 | 是 | 西文 | OFL-1.1 |
| Serif | Lora | `@fontsource/lora` | 400/700 | 是 | 西文 | OFL-1.1 |
| Serif | Merriweather | `@fontsource/merriweather` | 400/700 | 是 | 西文 | OFL-1.1 |
| Serif | Libre Baskerville | `@fontsource/libre-baskerville` | 400/700 | 是 | 西文 | OFL-1.1 |
| Serif | Cormorant Garamond | `@fontsource/cormorant-garamond` | 400/700 | 是 | 西文 | OFL-1.1 |
| Display | Bebas Neue | `@fontsource/bebas-neue` | 400 | 否 | 西文 | OFL-1.1 |
| Display | Oswald | `@fontsource/oswald` | 400/700 | 否 | 西文 | OFL-1.1 |
| Display | Anton | `@fontsource/anton` | 400 | 否 | 西文 | OFL-1.1 |
| Display | Archivo Black | `@fontsource/archivo-black` | 400 | 否 | 西文 | OFL-1.1 |
| Handwriting | Caveat | `@fontsource/caveat` | 400/700 | 否 | 西文 | OFL-1.1 |
| Handwriting | Dancing Script | `@fontsource/dancing-script` | 400/700 | 否 | 西文 | OFL-1.1 |
| Handwriting | Pacifico | `@fontsource/pacifico` | 400 | 否 | 西文 | OFL-1.1 |
| Handwriting | Great Vibes | `@fontsource/great-vibes` | 400 | 否 | 西文 | OFL-1.1 |
| Monospace / Tech | JetBrains Mono | `@fontsource/jetbrains-mono` | 400/700 | 是 | 西文 | OFL-1.1 |
| Monospace / Tech | Space Mono | `@fontsource/space-mono` | 400/700 | 是 | 西文 | OFL-1.1 |

字体选择器支持搜索、分类、文字预览及加载失败提示。选择和文字属性进入历史记录与项目保存，并共用于 2D、缩略图、3D 与 PDF。导出前等待字体加载。旧系统字体可打开、编辑和查看，但必须更换为内置字体才能导出 PDF，避免静默替换。

## 项目数据与迁移

Project v3 保存 `templateId:"snap-lock-carton"`、`dimensions`、`print:{bleedMm,safeAreaMm}`，五面对象仍以 mm 保存位置、尺寸、图层顺序和素材 ID。文字保存 `fontId`、字号、字重、斜体、字距、行距。折叠进度、镜头和辅助线显示开关为视图状态，不写入项目。

旧 v2 数据读取时先验证，纯函数 `migrateProjectV2` 保留对象与素材。首次覆盖 `projects["current"]` 前，在同一个 IndexedDB 事务中将原始 v2 记录写入 `projects["original-v2"]`；已存在备份不会被覆盖。原有上传 Blob 存储于 `assets`，`diecut-preview` 旧数据库不删除。结构损坏的当前记录会报错并保留原记录，不创建空项目覆盖。旧 `fontFamily` 映射到五个兼容 ID，供用户逐项更换。

## 3D、辅助线、印前与导出

- 3D 按前、右、背、左及胶口建立铰链链，顶面、插舌、背片、侧翼及四块不同锁底片分别绕所属边折叠。展开态自动取景，折叠进度在 0–100%，手动拖动中断播放；点选盒面先合盒再聚焦。背片圆孔在展开结构中可见。
- CUT／CREASE 默认显示。BLEED 由外轮廓向外偏移、孔洞向开孔方向偏移；SAFE 沿纸张保留区域内缩。曲线先离散，再由 Clipper2 处理偏移。单面画布用矩形面边界表达该面的出血、安全距离；总览展示完整刀板轮廓。
- 印前检查输出 `code、level、message、faceId?、objectId?`。校验尺寸、结构、出血、安全距离、旋转后越界、素材、字体、有效 DPI。有效 DPI 取图片两轴较低值：≥300 通过、200–299 警告、<200 强警告。结构无效、缺失素材或字体不可用阻止 PDF；检查不会移动图案。
- PDF 页尺寸为刀板或出血外界加四周各 2 mm 留白，并用 mm→pt 换算。五面分别按 150/300 DPI 位图渲染；CUT、CREASE 和出血轮廓为 PDF 矢量路径。导出不含选框、控制点或界面标签。单面像素预算 2500 万，总预算 8000 万，超出时给出明确错误。默认勾选出血、刀线、压痕，默认 300 DPI；150 DPI 仅用于草稿。
- PDF 是 RGB 校样基础文件，不是 CMYK、ICC 或 PDF/X 生产文件。出血线是结构辅助线；五面图案当前只覆盖各自面板，没有自动延伸到折片或面板外侧出血区。真实生产应由印前人员补足连续图案、工艺参数及刀模校准。

## 验证记录

在独立 4190 端口的生产预览运行浏览器测试，避免开发服务与构建共用 `.next`。最新验收结果：

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm test` | PASS | 11 项：v0.1 回归、冻结黄金刀板、四组尺寸、轮廓偏移、单位换算、30 字体注册、v2 迁移、DPI／印前检查 |
| `npm run typecheck` | PASS | TypeScript 全项目检查 |
| `npm run lint` | PASS | ESLint 无错误 |
| `npm run build` | PASS | Next.js 生产构建 |
| `E2E_BASE_URL=http://127.0.0.1:4190 npm run test:e2e` | PASS | 7 项：v0.1 回归、30 字体实际加载、折叠 0/50/100%、双语字体与撤销／刷新、辅助线、非正方形／参考尺寸 PDF、v2 原件备份、损坏记录保护 |

浏览器 PDF 测试解析了物理页面尺寸、五个嵌入图像的宽度、5 次图像绘制与超过 15 次矢量描线。参考尺寸及 120×80×200 mm 的折叠截图均已人工查看；后者的完整 PDF 使用 Poppler 渲染复核，未见裁切、错位或界面控件。测试输出在 `test-results/`，属于忽略的临时文件。

## 后续

v0.2.1 可评估最近字体、描边／阴影、TIFF、Straight Tuck End。v0.3 可继续推进印厂级 CMYK/ICC/PDF/X、生产纸张参数、连续出血图案、工艺校准与更多盒型。当前没有云端账号、协作或 AI 功能。
