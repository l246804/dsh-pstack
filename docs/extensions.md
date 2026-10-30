# DSH 版本地扩展

登记上游 pstack 未声明、由 DSH 版插件独立维护的产品能力。`EXT-*` 编号跨实现、Issue 和验收保持不变；`proposed` 表示已登记待实现，`active` 表示已实现并受回归验证保护，`retired` 表示已退役。移植能力使用 `pstack/README.md` 的原子能力编号，不在此登记。

每次基线重建都保留 `proposed` 与 `active` 条目，并验收 `active` 条目；本清单不代表功能已实现。

## EXT-003：pstack 角色模型配置页

- 状态：proposed
- 用户场景：安装 dsh-pstack 后，在 DSH Web/Desktop 的 Plugins 页查看并编辑 `$DSH_HOME/pstack-models.mdc`，无需手改文件或让 agent 整文件重写。
- 范围：角色文件路径与 `missing` / `loaded` / `unreadable` 状态；17 个角色的当前路由与 `inherit-parent` 回退；单角色编辑与重置；`pstack_models` 实时目录的 provider/model/effort 校验；幂等写回与缺失创建；未知角色或格式错误按行号展示；与 `/setup-pstack` 共用同一文件。
- 验收：见 `docs/extensions/EXT-003/review.md` 的 `required_behavior`（与 Issue #2 的验收行为一致）。
- DSH 公共接口与兼容版本：0.2.2-alpha.2；`plugins.bundle.config` 配置页插槽、`dsh.client` 浏览器半、Typert Remote（`TypertRemoteService` + 手写 strict 描述符，本仓无生成链）。
- 实现与验证：已实现（Issue #2，2026-10-30）；实现文件、测试与门禁证据见 `docs/extensions/EXT-003/review.md` 的“实现与验证”，状态等待审查。
- Issue：[#2](https://github.com/l246804/dsh-pstack/issues/2)
