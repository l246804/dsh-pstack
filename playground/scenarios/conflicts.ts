import type { ConflictRegression } from "../types.ts";

/**
 * The one conflict we verify as a regression: Agent Teams and the pstack root presets cannot
 * share a profile. `src/poteto-mode.ts` (row `poteto-mode-section`, `dsh-pstack/poteto-mode`)
 * throws `AGENT_TEAMS_CONFLICT` from `assertNoAgentTeams` whenever `ctx.get("agentTeams")` is
 * present. That row lives in each pstack root preset's plugin list, and `@deepseek-ai/dsh-agent-preset-registry`
 * mounts a preset eagerly when it registers, awaiting the host tree first. So once Agent Teams
 * registers `agentTeams`, mounting `poteto-mode`/`poteto-mode-creator` fails: the definition is
 * recorded as broken (加载失败) and the preset cannot compose a session. The web host itself
 * starts fine — a broken preset is non-fatal.
 */
export const agentTeamConflict: ConflictRegression = {
  type: "conflict-regression",
  id: "plugin-conflict-agent-team",
  environmentId: "agent-team-conflict",
  expectedConflict: {
    packages: ["@deepseek-ai/dsh-experimental-agent-team-profile"],
    symptom:
      'web 正常启动（两者可以共存），但设置 → Agent 预设里 pstack 根 preset 显示「加载失败」，不可选：Agent Teams 加载后注册了 agentTeams 服务，pstack 根 preset 行 poteto-mode-section（dsh-pstack/poteto-mode）在 preset 激活时看到该服务，抛出 "pstack root presets cannot be used with Agent Teams"，于是 poteto-mode / poteto-mode-creator 无法组合会话，新会话的预设菜单里也不出现它们。',
    recovery:
      "禁用 @deepseek-ai/dsh-experimental-agent-team-profile，或改用未加载 pstack 根 preset 的 standard / Creator preset。不要让 Agent Teams 与 pstack 根 preset 在同一 profile 共存；共存时 web 能启动，但根 preset 不可用。",
  },
  turns: [
    {
      prompt: "同时启用 Agent Teams 与 pstack 根 preset 会怎样？",
    },
  ],
  workspace: { files: {} },
  observations: [
    {
      id: "preset-unavailable",
      description:
        'web 启动成功（打印 URL）；设置 → Agent 预设里 [data-agent-preset-id="poteto-mode"] 显示「加载失败」，告警文本含 "Agent Teams" 与 "preset" 关键词，证明根 preset 因 Agent Teams 存在而拒绝组合；新会话预设菜单不提供 poteto-mode。',
    },
  ],
  source: {
    upstreamSkill: "cordis.patch.yml",
    regression:
      '根 preset 行 poteto-mode-section（dsh-pstack/poteto-mode）的 assertNoAgentTeams 守卫：ctx.get("agentTeams") 存在时抛 AGENT_TEAMS_CONFLICT（src/poteto-mode.ts），使 preset 激活失败并标记为 broken。',
  },
};

export const conflicts: readonly ConflictRegression[] = [agentTeamConflict];

export function conflictForEnvironment(environmentId: string): ConflictRegression {
  const scenario = conflicts.find((entry) => entry.environmentId === environmentId);
  if (!scenario) {
    throw new Error(
      `no conflict regression for environment ${environmentId}; known: ${conflicts
        .map((entry) => entry.environmentId)
        .join(", ")}`,
    );
  }
  return scenario;
}
