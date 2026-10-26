# 决定：手工维护的静态资源集中在 `static/`，插件图标换成 PNG

Status: accepted
Date: 2026-10-26

## 背景

仓库根目录原来只放了一个 `icon.svg`，是唯一手工维护的静态资源。图标要换成用户提供的插画，后续还可能再有截图、示意图之类的静态文件，全部摊在根目录会让"哪些文件是本项目自有的"变得看不出来。

根目录不能随便放东西的另一个原因是 `assets/` 的性质：它按 [上游生成移植](2026-10-24-upstream-generated-port.md) 由确定性生成器产出，`check:assets` 的 `checkLayout` 只允许 `skills/`、`agents/`、`docs/` 三个顶层目录，并且 `checkUndeclaredFiles` 会拒绝任何没有上游来源的文件。手工资源放进 `assets/` 会被判成"无上游来源"，也会破坏"生成树可由 `pnpm sync` 重建"这个前提。

DSH 宿主的读图标逻辑（`dsh-app-boot` 的 `iconOf`）接受 SVG、PNG、JPEG、WebP，上限 256 KiB，路径必须留在声明它的目录内；`package.json` 的 `icon` 优先于导出的 `<specifier>/icon`。原 `checkIcon` 只认识 SVG 文档头，比宿主更窄，也没检查大小以外的东西。

## 决定

1. 新增根目录 `static/`，作为手工维护静态资源的唯一位置。`assets/` 保持纯生成树，两者互不收纳。
2. 插件图标改为 `static/icon.png`，512×512。源图是用户提供的 1536×1536 PNG，等比缩放到 512 后用调色板压缩，约 141 KiB，在宿主 256 KiB 上限内。图标是插画而不是线条 mark，位图比矢量更合适；不提供 SVG 壳内嵌位图那种折衷形式。
3. `package.json` 的 `icon`、`exports["./icon"]` 和 `files` 同步改到 `static`；README 的 `<img src>` 指向 `static/icon.png`。
4. `check:assets` 增加 `STATIC_FILES` 清单与 `checkStaticDirectory`：`static/` 下的实际文件必须与清单逐项相等，允许新增但必须同时登记，且不允许多级子目录，保住"一屏读完的清点"。
5. `checkIcon` 按宿主的四个格式校验：扩展名在集合内、文件非空、不超过 256 KiB、前导字节与扩展名相符；`package.json` 的 `icon` 必须落在 `static/` 内。
6. README 里 `<img src>` 的目标必须是 `static/` 下的已登记文件。Markdown 链接检查看不到 HTML 标签，图标改名后第一屏会静默破图，所以单独加一条。

本记录取代 [README 内容决策](2026-10-24-readme-content.md)第 7 条里"展示 `icon.svg`"这一处具体路径；该条其余要求（顶部展示插件 logo、提供可读替代文本）继续有效。

## 备选方案

- 继续放在根目录，只把 `icon.svg` 换成 `icon.png`。放弃：下个静态资源又会往根目录多一个文件，没有地方说清哪些是本项目自有的。
- 放进 `assets/` 的子目录。放弃：`assets/` 是生成树的提交副本，任何手写文件都会和 `pnpm sync` 的字节比对、`checkUndeclaredFiles` 的上游来源规则冲突。
- 放进 `src/` 或 `dist/`。放弃：`dist/` 是构建产物且被清理，`src/` 是 TypeScript 源码目录，都不该承载随包静态文件。
- 保留 SVG 的形式，把位图 base64 内嵌进 `<svg>`。放弃：得到一个名字是矢量、内容是位图的文件，`checkIcon` 与所有路径可以不动，但阅读和替换的人都得多绕一层；约 190 KiB 也不比直接用 PNG 小。
- 用 WebP 换体积（512 约 50 KiB）。放弃：插画有渐变与细边缘，实测 WebP 在 48/96/320 px 显示尺寸上的 RMSE 是 PNG 调色板版本的约 2.5 倍，省下的 90 KiB 不值得。
- 不登记静态文件清单，只检查存在。放弃：那样新加的文件无声地进入发布包，没有人确认过它该不该随包。

## 后果

`icon.svg` 从根目录删除，`files` 里由 `static` 取代。发布包的条目数不变（一个图标文件换一个图标文件），但根目录不再堆积静态文件。

代价是每次新增静态资源要改一处清单：`STATIC_FILES` 加名字，`files` 已按目录整包包含，因此只需这一步。忘记登记会失败在 `check:assets`，而不是发布后才发现多了个没人认识的文件。

图标本身没有可追溯的授权文件。当前按用户提供处理，不在此记录内做许可判断；将来若引入第三方素材，需要在同一变更里补来源与许可，并考虑是否把它从 `STATIC_FILES` 升级成带出处字段的清单。
