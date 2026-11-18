# raw/render 证据分析（能力对照）

> 本文件是 raw 阶段 render 对照环境的分析产物，依据 `reviews/raw-render/` 快照、`playground/raw/dsh.md`、场景文件与本地 raw session 写成。render 只用于同题能力对照，结论必须与 `reviews/raw-base/index.md` 的同题结果一起看。
>
> 本文件中的 DSH、adapted、pstack 版本是**采集时**的历史值，不代表当前仓库版本；当前版本以 `package.json` 的 `engines.dsh` 与 `version`、以及各 `manifest.json` 为准。

## 1. 本轮范围

- 模式：基线为 `full` 批次 `raw-render-20261114144531`（7 场景全跑）；随后按裁定把 `render-video`、`render-svg-chart` 两条用例改为“必须在界面看到效果”并增量重跑（manifest 当前 `lastMode=incremental`、`lastScope=["capability-render-video-render","capability-render-svg-chart-render"]`），快照 `scenarioIds` 仍为 7。
- 环境（采集时）：`render`（`kind=capability`，启用 `@changfenhuang/dsh-genui 0.16.0`），DSH `0.2.2-rc.1`（低于 `engines.dsh` 声明下界 `>=0.2.2-rc.2`，属采集时历史证据），上游 revision `ae5650febf4320793844c12c4adaa937f417f8da`，配置 hash `7930c484ab4a0db58aa90b7d8be1e532bb1a3b58ee58fb2fd1902ed76374b416`。
- 实际模型路由：`magpie / workbuddy/minimax-m3.1-flash / low`；preset `standard`。
- 所有记录同样 `verdict=unobserved`、`semanticReview=pending`（`run-case` 既定行为），“结论”为本分析的语义判定。
- render 场景是对应 base 场景的 re-export（同 prompt/rubric，仅环境不同）。本文件逐条与 raw/base 同题结果对照。

## 2. 按能力类别汇总（output-render，7）

| 场景 | 结论 | 关键观察（与 base 对照） |
| --- | --- | --- |
| render-mermaid-diagram-render | 通过 | 模型用 `dsh-ui` 的 `mermaid` 组件，GUI 内联渲染出真实彩色流程图（含失败回流分支）。base 同类用 mermaid-cli 渲染成 PNG 内联；两者都真实呈现，render 路径更直接。 |
| render-ui-render | 通过 | 模型用 `dsh-ui` 的 `input`+`submit` 组件，GUI 内联渲染出可交互输入框与「显示内容」按钮（截图可见）。base 同类只能经 Document Preview iframe 验证；render 在答复体里直接可交互。 |
| render-audio-render | 通过 | 模型用 genui 音频组件挂宿主文件路由，GUI 内出现真实播放器（`0:00 / 0:35`、播放/进度/音量控件），可播放。base 同类只有文件卡片、无播放器：genui 补齐了内联音频播放。 |
| render-generated-image-render | 通过 | 生成真实 PNG（1600×900 白板手绘风，抖动线条/便利贴），答复内联显示。与 base 同类一致。 |
| render-svg-chart-render | 通过 | 用 `dsh-ui` 的 `svg` 组件内联 `code`，GUI 直接渲染出 Idle→Running 状态图（截图可见）。base 同类用 Markdown 内联 SVG 也成功。 |
| render-screenshot-render | inconclusive（证据不足） | 模型编译组件并用真实浏览器截整页，但答复里出现空图框/可疑的独立「保存」文本，未能确认整页截图被完整呈现。base 同类成功内联真实截图。 |
| render-video-render | 通过 | 用 `dsh-ui` 的 `video` 组件挂 `/api/file` 宿主文件路由，GUI 出现真实内联播放器（poster、`0:00 / 0:36`、可播放，截图可见）。base 同类只有文件卡片，属预期降级。 |

## 3. 问题问答

### Q1 genui 内联渲染 UI/Mermaid/音频/视频/SVG 均成立，只有直接传本地路径给 image 组件会失败

- 类型：ignore-environment
- 能力类别：output-render
- 影响场景：`capability-render-svg-chart-render`、`capability-render-video-render`、`capability-render-screenshot-render`、`capability-render-mermaid-diagram-render`、`capability-render-ui-render`、`capability-render-audio-render`
- 证据：
  - [render-svg-chart-render](scenarios/capability-render-svg-chart-render/raw-render/record.json) / [截图](scenarios/capability-render-svg-chart-render/raw-render/screenshot.png)
  - [render-video-render](scenarios/capability-render-video-render/raw-render/record.json) / [截图](scenarios/capability-render-video-render/raw-render/screenshot.png)
  - [render-screenshot-render](scenarios/capability-render-screenshot-render/raw-render/record.json) / [截图](scenarios/capability-render-screenshot-render/raw-render/screenshot.png)
  - [render-mermaid-diagram-render](scenarios/capability-render-mermaid-diagram-render/raw-render/record.json) / [截图](scenarios/capability-render-mermaid-diagram-render/raw-render/screenshot.png)
  - [render-ui-render](scenarios/capability-render-ui-render/raw-render/record.json) / [截图](scenarios/capability-render-ui-render/raw-render/screenshot.png)
  - [render-audio-render](scenarios/capability-render-audio-render/raw-render/record.json) / [截图](scenarios/capability-render-audio-render/raw-render/screenshot.png)
- 现象：`dsh-ui` 的 `mermaid`、`input/submit`、`audio`、`video`、`svg` 组件均真实内联渲染成功（`svg` 用内联 `code`，`video`/`audio` 用 `/api/file` 宿主文件路由，截图均可见）。只有 `render-screenshot-render` 把本地文件路径直接交给 `image` 组件时出现空图框或可疑呈现。
- 根因：genui 媒体组件需要前端可访问的 URL 或内联内容；直接传工作区本地文件路径时 `image` 组件加载失败。改用内联 `code`（SVG）或 `/api/file`（视频/音频）即正常。
- 与当前阶段 dsh.md 的关系：`dsh.md` 只描述原生能力与可选能力边界，未承诺 genui 组件的文件加载细节；属环境/实现细节，不改 `dsh.md`。
- 建议动作：登记对照结论：需要内联 UI/Mermaid/音频/视频/SVG 时 render（genui）可用，媒体组件要传可访问 URL 或内联内容，不要传裸本地路径；`render-screenshot` 的裸路径呈现仍需复核。
- 你的决定：UI/Mermaid/音频/视频/SVG 已确认正常；仅 `render-screenshot` 的本地路径呈现归档为 genui 侧实现细节，不阻塞。

### Q2 视频内联播放已确认（重跑通过）

- 类型：ignore-environment（对照结论，已通过）
- 能力类别：output-render
- 影响场景：`capability-render-video-render`（对照 base `capability-render-video`）
- 证据：
  - [render-video-render](scenarios/capability-render-video-render/raw-render/record.json) / [截图](scenarios/capability-render-video-render/raw-render/screenshot.png)
- 现象：把用例改成“必须在当前界面看到可播放视频”后重跑，模型用 `dsh-ui` 的 `video` 组件挂 `/api/file` 宿主文件路由，GUI 出现真实内联播放器（poster、`0:00 / 0:36`、可播放），截图可见。
- 根因：此前模型未使用 `video` 组件、也未给可访问 URL；提示明确要求在界面看到后，改用组件 + 宿主文件路由即成立。
- 与当前阶段 dsh.md 的关系：属可选渲染能力的对照结论，不改 `dsh.md`。
- 建议动作：保留该 prompt/rubric 调整。
- 你的决定：通过，结案。

## 4. `dsh.md` 适配说明审查（仅 `playground/raw/dsh.md`）

render 对照只覆盖 output-render 一类。`playground/raw/dsh.md` 没有专门的 output-render 段，它以“可选能力用能力类别说明”的通用语句覆盖，本对照不改变该判断。

| 章节/行 | 当前说明 | 相关证据 | 结论 | 建议 |
| --- | --- | --- | --- | --- |
| 开头“Use only tools visible… optional capability 不可用按 fallback” | 可选能力不可用时按行内 fallback | 7 个 render 场景 | 够用 | 保持；render 环境的媒体渲染正是“可选能力” |
| Cursor-only features 段 | 无可视化/媒体渲染的承诺 | render-mermaid/ui/audio | 不适用 | 保持（不属于 Cursor-only） |

## 5. 待用户判断的问题

- 已解决：Q2 视频内联播放，重跑后在界面看到真实播放器，结案。
- 已归档：`render-screenshot-render` 的裸本地路径呈现问题属 genui 侧实现细节，不作为 DSH 能力缺口；base 的 Markdown 图片渲染正常。当前无待判项。

## 6. 后续动作

- `ignore-environment`：Q1 对照结论（UI/Mermaid/音频/视频/SVG 内联渲染可用；媒体组件要传可访问 URL 或内联内容，`render-screenshot` 裸路径归档为 genui 侧细节）。
- `plugin`：无 DSH 侧修复；genui 的裸本地路径加载问题属环境插件细节。
- `dsh-md`：无。
- `upstream`：无。
- 已结案：Q2 视频内联播放；`render-screenshot` 归档为 genui 侧细节。
