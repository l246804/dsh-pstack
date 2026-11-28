# src 目录说明

本文件只写 `src/` 的长期实现规范，不描述会频繁变化的模块清单、文件职责或实现步骤。模块图和入口以 [../docs/architecture.md](../docs/architecture.md) 为准。

## 适配交付物

- `dsh.md` 与 `dsh.zh.md` 是随包适配答案的唯一手写来源，构建时盖章进 `dist/pstack/docs/harness/dsh.md`；编写规则见 [../docs/dsh-adapter.md](../docs/dsh-adapter.md)。
- `surface.json` 是公开工具清单，由 `vpx scripts/release-surface.ts --write` 从工具工厂导出，不手改。
- `docs/extensions.md` 登记非缺口的本地扩展；`docs/regressions.md` 登记跨移植回归；`docs/dsh-tool-adapters.md` 定义包装 DSH 原生工具的共同契约与升级核查方式。

## 实现依据

- 以当前运行时的 DSH 能力和官方类型/API 为准；不要凭 Cursor 或旧实现猜测接口。
- 可选插件和运行时能力不作为默认存在；需要时先确认当前环境实际提供什么，并保留缺失时的降级。

## 适配原则

适配时优先复刻上游同一动作的调用形态，并让工具参数贴近运行时原生的委派契约。上游 skill 里的散文式决策（做几次、选哪一个）应留在调用方，不要固化为配置结构、下标或专用选择参数。配置与映射由调用方读取或经只读发现获得，工具只做校验和执行；新增或改造工具前，先对照上游同类动作确认适配层没有引入上游不存在的概念。

- 上游 `claude-code.md` 明确排除的 Cursor 云服务和平台能力同样舍弃。
- 通用本地能力可独立适配，但不宣称等价于云服务。
- 非常用能力不默认提供插件补偿；环境不满足时明确报告不可用，不把跳过算作适配成功。

## 边界

- Host、Client 和共享协议各守自己的边界；跨边界只走明确契约，不绕过运行时服务直接访问对方内部。
- 生成物不是实现源码，不手工修改生成结果。
- 业务逻辑在 `src/` 内实现。
- 适配实现变化需要新增、删除或改变工具、服务、skill 目录或 preset 时，同步根 `cordis.patch.yml`；装配规则见 [../docs/architecture.md](../docs/architecture.md#bundle-assembly)。
- 新功能先确认它是否来自 playground 缺口；非缺口扩展按 [docs/extensions.md](./docs/extensions.md) 登记。

## UI 风格

- 复用现有界面组件、样式、图标、提示和本地化方式，不另起一套视觉或文案体系。
- 新增交互保持现有布局、焦点、禁用态、错误提示和未保存草稿行为一致。
- UI 变更以实际可操作性和可访问性为准，不以堆叠装饰或临时样式代替现有组件。

## 验证与记录

- 按仓库标准命令运行检查、类型检查、测试和生成一致性检查。
- 只在 `src/` 内做纯逻辑和 DOM 行为测试；需要真实 Cordis、profile、浏览器或模型的验证放到 `playground/`。
- 修改客户端布局或交互后，按 [UI 验证说明](../playground/docs/ui.md) 在真实页面验证受影响流程：视觉变化查看截图，交互变化实际操作。
- 反复出现的移植陷阱登记到 [docs/regressions.md](./docs/regressions.md)，普通缺陷由测试和提交记录承载。
- 具体验证命令以 `package.json` 和 `vite.config.ts` 为准，不在此复制会变化的脚本列表。
