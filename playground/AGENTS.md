# Playground 入口

Playground 用真实 DSH Web 会话验证原生能力和适配实现。先读本文件；具体规则只在对应文档展开。

## 环境

- worker 以 Docker 容器运行：Linux 原生 Docker、macOS Docker Desktop/Colima/OrbStack、Windows 在 WSL2 内。
- 先运行 `vp run playground:doctor` 检查 daemon、镜像架构和 DSH 版本；缺镜像时运行 `vp run playground:image`。
- 每个 worker 使用独立 home、浏览器 profile、evidence 和仓库内被忽略的 `.workspace`；容器只挂载固定 `/dsh` 路径。
- 真实模型选择由用户确认；RunRecord 记录实际路由、DSH 版本、pstack 版本、上游 revision 和配置 hash。
- 运行维度是 variant × environment：`native` 观察 DSH 标准能力，`adapted` 验证插件实现。

## 目录

- `runner/`：执行器。`container` 容器生命周期、`browser` 浏览器、`execution` run-scenario 引擎、`config` 配置、`worker` worker/profile、`evidence` 证据、`scenario` 场景注册。
- `scripts/`：记录后处理，compare、status-table、review、redact、gap-lock。
- `scenarios/`：probe 定义和 `gap-lock.json`。
- `tests/`：playground 包内测试；根 `tests/` 只留仓库级发布测试。

## 先读

| 触发 | 文档 |
| --- | --- |
| 改 `config.ts`、provider、凭证或浏览器 | [docs/config.md](./docs/config.md) |
| 理解 variant/environment、运行身份或证据布局 | [docs/model.md](./docs/model.md) |
| 新增/修改场景，处理 gap 或 regression | [docs/scenario-rules.md](./docs/scenario-rules.md) |
| 跑阶段、批次、增量或发版 | [docs/workflow.md](./docs/workflow.md) |
| 改容器、prepare/bootstrap、预览或 stop | [docs/worker.md](./docs/worker.md) |
| 分析记录、写 findings 或 review | [docs/evidence-analysis.md](./docs/evidence-analysis.md) |
| 脱敏或提交证据 | [docs/evidence-redaction.md](./docs/evidence-redaction.md) |

## 配置

- 本地配置是 `playground/config.ts`，从 [config.example.ts](./config.example.ts) 复制；`config.ts` 和 `*.local` 不入库。
- provider、`fromHost`、密钥、账号和浏览器细节见 [docs/config.md](./docs/config.md)。
- `copyCredentials` 默认 false；默认不复制宿主 `.credentials.yaml`。

## 流程概览

1. gap 流程先确认 `native/gaps.json` 的 confirmed 缺口；regression 流程只需场景即可。
2. 生成 native 树，准备 native worker，跑 native probe，collect。
3. 在独立分析会话写 `evidence/findings/native.md`，完成 review 和 redaction。
4. 更新适配代码、`src/dsh.md` 和生成树，build 后跑 adapted。
5. 写 `evidence/findings/adapted.md`，完成 review 和 redaction。
6. 通过后更新 README/兼容表，停在 release-ready。

## 硬约束

- 阶段隔离按 [docs/evidence-analysis.md](./docs/evidence-analysis.md)；场景规则按 [docs/scenario-rules.md](./docs/scenario-rules.md)。
- `prepare → bootstrap → run-batch → collect` 必须在一个长期存活的 background job 中串行执行。
- `vp run playground:gap-lock -- --check` 守卫 confirmed gap 与 gap 场景同步；regression 场景不进入 gap-lock。
- 提交前运行 `vp run ci`。
