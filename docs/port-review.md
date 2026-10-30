# pstack 移植审查报告

- 轮次（round）：`baseline`
- 上游提交：pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`（`0.15.36`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`（`0.2.2-alpha.2`）
- 开始时间（started_at）：2026-10-30T11:56:52+08:00
- 完成时间（completed_at）：2026-10-30T12:33:34+08:00

## doc 自检

- **能力边界**：PASS。`pstack/README.md` §3.3 的 `OPT-01` 至 `OPT-09` 与 `dsh.md` 的 `## Optional plugins` 逐项对应；每行都写了启用能力、未启用 fallback 或 `Skipped in DeepSeek Harness` 行，并列出云 VM、每候选工作树、GitHub 登录、stack verdict、provider 单槽、macOS PTC、Windows、GUI 与视频、精确 `cwd`、MCP 默认 server、Agent Teams 冲突、常驻循环等支持边界。
- **措辞一致**：PASS。跳过行统一为 `Skipped in DeepSeek Harness: <step>. <reason>.`；`workspace` 与会话 `cwd` 分开表述，跨会话读取要求精确 `cwd`；`maxDepth` 默认 2、`roleIndex` 默认首个、缺失角色文件回退 `inherit-parent` 与实现一致；随包清单写 `skills/`、`docs/guide/`、`agents/`、`README.md`、`LICENSE`；技能经 `pstack_skill` 加载，相对资源就地读取。
- **归类判断**：PASS。`## Local replacements` 覆盖 `create-skill`、`/deslop`、`/loop`、`/automate`、`Custom Mode`、`/visualize`、`control-ui`、`control-cli`、`cursor-team-kit`；这些名字在 `pstack/README.md` 有替代记录，并出现在随包技能、playbook 或 reference 的运行期步骤中。

## 整文档审查

- `pstack/harness/docs/harness/dsh.md`：有修改。补全 Paths 的随包清单（`agents/`、`LICENSE`），澄清技能经 `pstack_skill` 加载，并给 `OPT-01` 至 `OPT-09` 逐行补上支持边界。
- `pstack/README.md`：有修改。§8.5 补记 `Local replacements` 与 `Optional plugins` 两个固定追加小节，§5 补记运行期替代映射；能力状态与功能结论未改。
- 根 README：`README.md` 与 `README.zh.md` 同步 pstack 基线提交 `4dd1d05`、可选插件实验性状态与 `origin` CLI 缺口。
