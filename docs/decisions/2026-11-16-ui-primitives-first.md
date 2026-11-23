# 决策：客户端 UI 优先使用 DSH primitives

Status: accepted
Date: 2026-11-16
Scope: src/client/**, tests/**, vite.config.ts, docs/decisions/**
Implemented-by: commit:c9f76c3
Review: 2026-11-22

## 背景

`dsh-pstack` 的客户端页面同时维护了 `Button`、`IconButton`、`Switch`、`Status`、`Spinner`、`SegmentedTabs` 等本地控件，以及自定义弹窗、Toast、图标和覆盖层样式。DSH 已经通过 `@deepseek-ai/dsh-client-ui-primitives` 提供标准控件、图标、Tooltip、Toast、Modal 和设置表单组件，并明确要求需要标准控件时优先复用这个包，因为插件之间不能直接导入组件。

继续保留本地实现会导致视觉、键盘行为、可访问性和 DSH 主题 token 逐步漂移，也会让同一个开关、按钮或弹窗在不同页面呈现不同交互。需要一条统一规则决定什么时候使用 primitives，什么时候允许本地组件存在。

## 决策

客户端 UI 默认使用 `@deepseek-ai/dsh-client-ui-primitives`。

- 官方 primitives 已提供等价组件时，直接使用官方组件，不在 `src/client` 复制实现。
- 弹窗统一使用 primitives `Modal`，不再维护本地 overlay、mask、panel、header、focus trap 和对应 CSS。
- 官方组件缺少必要行为时，只允许做一层薄适配或组合，不重新实现已有控件。例如 `IconButton` 可以用 `Button` 组合，`Status` 可以用 `Tag` 和 `StateDot` 组合。
- 官方 Toast 没有函数式 API 时，允许用单例 React root 包装官方 `Toast`，不在业务代码复制一套 Toast DOM 和 CSS。
- 图标优先使用 primitives 的图标导出，只有 primitives 没有对应图标时才保留本地图标。
- `src/client/components` 只放 React 组件，纯函数、浏览器辅助和样式注入放到 `src/client/lib`。
- UI 不新增像素级或组件渲染测试，也不保留 primitives mock。UI 以实际视觉审查为准，非 UI 逻辑继续走普通测试。
- 视觉和交互以 primitives 为准，不通过本地 CSS 重造一套控件体系。

## 替代方案

**继续使用本地 `ui.tsx` 控件、本地弹窗和 pstack 样式。** 否决。实现会重复 primitives 已有的按钮、开关、分段选择、状态、Modal 和 Toast，后续 DSH 更新时无法同步，且键盘、焦点、禁用态和主题行为容易分叉。

**把 primitives 的源码复制到本地再改。** 否决。复制会把上游行为和修复固定死在仓库里，增加维护面，也违背官方“插件不能导入另一个插件组件”的共享方式。

**只使用 primitives 的 CSS token，不直接使用组件。** 否决。token 只能统一颜色和尺寸，不能统一组件行为、无障碍语义和键盘交互。

**保留 UI 测试和 primitives mock 来验证控件。** 否决。UI 形态以视觉审查为准，mock 只能验证替身行为，不能证明真实 primitives 的视觉和交互，反而增加维护面。

## 后果

- `src/client/components/ui.tsx` 中 primitives 已覆盖的控件应迁移为官方组件，本地文件只保留缺失能力或薄适配。
- 弹窗由 primitives `Modal` 提供遮罩、焦点、Esc 和布局行为，本地 overlay、mask、panel 和 focus trap 删除。
- Toast 保持函数式调用入口，但渲染交给官方 `Toast` 组件。
- 本地图标集逐步收缩到 primitives 没有的图标。
- UI 验证以实际视觉审查为主，不新增像素级或组件渲染测试，也不保留测试 mock。
- 后续 DSH primitives 版本升级时，控件行为随宿主升级，不在仓库内另行维护一份。
