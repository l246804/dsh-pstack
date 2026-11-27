# 客户端交互验证

`adapted/ui` 为客户端验证提供独立的容器、home 和 workspace，加载当前工作树构建的插件，与手动预览的 `adapted/preview` 分开。playground 管理 worker；agent 按 agent-browser 技能自行启动、操作和关闭浏览器。配置与镜像准备见 [run.md](./run.md)。

## 启动与连接

```sh
vp run playground:ui:open
node_modules/.bin/agent-browser skills get core
node_modules/.bin/agent-browser session id --scope worktree --prefix pstack-ui
```

`ui:open` 构建、安装当前源码并启动 worker，输出访问 URL。使用输出的完整 URL（含认证参数）连接；同一 URL 也保存在 `config.runtime.workersDir` 下的 `adapted/ui/w0/web-url.txt`。浏览器在宿主侧启动即可访问 worker。

将下面的 `<session>` 替换为命令返回的名称，后续操作保持使用该 session。连接、快照、点击、截图及所需浏览器参数按技能执行。

```sh
node_modules/.bin/agent-browser --session <session> open '<worker-url>'
node_modules/.bin/agent-browser --session <session> snapshot -i
```

修改代码后再次运行 `ui:open` 安装新构建，用新输出的 URL 重新打开页面并复核。需要清空 worker 本地数据时运行 `playground:ui:reset`。结束后分别关闭浏览器和 worker：

```sh
node_modules/.bin/agent-browser --session <session> close
vp run playground:ui:close
```

## 检查方式

临时截图和调试文件写入仓库 `.tmp/`，截图命令使用绝对路径。以未保存草稿的放弃确认框为例：修改角色路由后关闭配置页，查看确认框截图，实际操作取消和放弃，确认草稿保留或丢弃符合预期。

纯 UI 操作不调用模型；需要发送会话消息时，先按根目录规则确认模型。结果写进对应修复的 PR；需要长期回归时，由用户将其加入场景集合，并按 [judge.md](./judge.md) 保留简短结果与选用图片。
