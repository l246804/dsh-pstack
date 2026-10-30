# EXT-005：bundle 配置模态框

- status: implement
- repair_target: extension
- issue: https://github.com/l246804/dsh-pstack/issues/12
- 关联能力: EXT-003（角色模型配置）、EXT-004（推荐可选插件）

## required_behavior

- bundle 详情页页头右上角出现「配置」按钮（`plugins.detail.actions` 页头控件槽），与页面自身的开关、卸载等控件同区。
- 点击「配置」按钮打开一个居中模态框，外观与交互仿照 Settings 设置弹窗（遮罩、圆角居中卡片、可关闭）。
- 模态框内部左右分栏：左侧为配置分区导航（推荐可选插件、角色模型配置），右侧显示当前选中分区的表单内容；切换左侧分区时右侧随之切换。
- 详情页不再通过 `plugins.bundle.config` 内联渲染配置块，配置只在模态框中出现。
- 各分区原有功能不回归：推荐可选插件的状态展示、单项开关与「一键启用推荐项」；角色模型配置的读取、编辑、保存、重置、校验错误展示均正常。
- 关闭模态框后回到 bundle 详情页；未保存的编辑按现有策略丢弃（离开即丢弃暂存修改，只有保存才写入）。
- 支持中 / 英两种语言，沿用现有 `pstackRoles` / `pstackPlugins` locale 命名空间。

## 实现证据

- 待实现。

## 审查证据

- 待审查。

## 验收证据

- 待验收（Issue #12）。
