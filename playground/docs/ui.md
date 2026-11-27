# 客户端交互验证

`adapted/ui` 是 agent 检查客户端的独立 worker，加载当前工作树构建的插件，使用自己的容器、home、workspace 和受管理浏览器。配置与镜像准备见 [run.md](./run.md)。它与手动预览的 `adapted/preview` 分开，不参与现有场景批次。

```sh
vp run playground:ui:open
vp run playground:ui:browser -- snapshot -i
vp run playground:ui:browser -- click @e3
vp run playground:ui:browser -- snapshot -i
vp run playground:ui:browser -- screenshot
vp run playground:ui:close
```

`open` 会构建、安装当前源码并打开页面。`browser` 透传 agent-browser 命令，连续调用保留页签、表单草稿和弹窗状态，不会重新导航；省略命令时返回交互快照。元素引用来自最近快照，页面变化后重新获取。完整命令见 `node_modules/.bin/agent-browser skills get core`。

浏览器固定使用独立的受管理 Chrome，不接管 `config.browser` 指定的批次 CDP 浏览器。`screenshot` 不带参数时保存到该 worker 的 `evidence/ui.png`；也可传入路径保留多张截图。`ui:close` 关闭 UI worker 和浏览器；`ui:reset` 清空它们的本地数据并重建。修改代码后再次运行 `ui:open` 安装新构建，然后重新进入待验证页面。

## 检查方式

以未保存草稿的放弃确认框为例：打开插件配置，修改角色路由，关闭配置页；检查确认框的文字、按钮状态和布局，分别操作取消、Esc、遮罩与放弃，观察草稿保留或丢弃是否符合预期。截图检查视觉效果，交互后再次取快照确认结果。构建通过不能代替页面验证。

纯 UI 操作不调用模型；需要发送会话消息时，先按根目录规则确认模型。结果写进对应修复的 PR；需要长期回归时，由用户将其加入场景集合，并按 [judge.md](./judge.md) 保留简短结果与选用图片。浏览器快照、调试日志和完整 session 留在本地。
