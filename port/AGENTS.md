# port 目录说明

本文件描述 `port/` 的职责、文件边界和文档指针。

## 目录职责

`port/` 保存最终适配文档和发布边界：

- `dsh.md`：最终适配文案的唯一手写来源。
- `dsh.zh.md`：`dsh.md` 的逐行中文审阅译文。
- `baseline.json`：当前移植的 pstack 版本。
- `docs/`：port 自身的详细规则和记录。

`port/` 只保存上述交付文件。

## 文档指针

| 文档 | 职责 |
| --- | --- |
| [docs/baseline.md](./docs/baseline.md) | baseline.json 字段、兼容表分组和发布同步规则 |
| [docs/extensions.md](./docs/extensions.md) | 非 gap 移植的本地扩展 |
| [docs/regressions.md](./docs/regressions.md) | 反复出现的移植问题和验证方式 |
| [../docs/dsh-adapter.md](../docs/dsh-adapter.md) | dsh.md 模板、分块规则和 native/port 差异 |
| [../src/AGENTS.md](../src/AGENTS.md) | src 长期实现规范和边界原则 |

`dsh.md` 的编写规则只链接 `docs/dsh-adapter.md`，不在 port 内复制。可选插件清单以根 `README.md` 为准，不在 port 重复维护。

## 生成与发布

1. 按 `docs/dsh-adapter.md` 维护 `dsh.md` 和 `dsh.zh.md`。
2. 生成后运行 `vp run generate:check` 检查生成树。
3. 用 `vpx scripts/generate-pstack.mjs --target port` 生成根 `pstack/`；加 `--check` 检查漂移。
4. 破坏性适配同时更新 `package.json` 的 DSH 范围，并在各本地化 README 新增对应兼容分组；`baseline.json` 的 `pstackVersion` 随上游 pstack 发版更新。
5. 发布说明由 agent 会话按 `changes/AGENTS.md` 从上一 tag 到当前的提交归纳生成到 `changes/RELEASE.md`，逐条与用户确认；`vp run release` 要求该文件存在且已提交后才 bumpp，发布后删除。

## 边界

- 根 `pstack/` 只放生成的插件树，不能手工放入文件。
- 上游 `claude-code.md` 明确排除的 Cursor 云服务和平台能力同样舍弃。
- 通用本地能力可以独立适配，但不宣称等价于云服务。
- 非常用能力不默认提供插件补偿；环境不满足时明确报告不可用，不把跳过算作适配成功。
- `port/` 只写最终交付和发布规则；实现细节见 `src/AGENTS.md`，验证流程见 `playground/AGENTS.md`。
- 适配实现变化如果需要新增、删除或改变工具、服务、skill 目录或 preset，还要同步根 `cordis.patch.yml`；装配规则见 [../docs/architecture.md](../docs/architecture.md#bundle-assembly)。
