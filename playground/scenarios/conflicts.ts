import type { ConflictRegression } from "../types.ts";

/**
 * The one conflict we verify as a regression: the Agent Teams profile and the pstack root
 * preset cannot share a profile. `src/poteto-mode.ts` throws `AGENT_TEAMS_CONFLICT` from
 * `assertNoAgentTeams` at preset mount when the `agentTeams` service is present, so the
 * web process exits instead of printing a URL.
 */
export const agentTeamConflict: ConflictRegression = {
  type: "conflict-regression",
  id: "plugin-conflict-agent-team",
  environmentId: "agent-team-conflict",
  expectedConflict: {
    packages: ["@deepseek-ai/dsh-experimental-agent-team-profile"],
    symptom:
      '启动 profile 时进程退出、不打印 web URL：cordis.patch.yml 的 pstack 根 preset 行（dsh-pstack/poteto-mode）在 apply 时看到 agentTeams 服务已由 @deepseek-ai/dsh-experimental-agent-team-profile 注册，抛出 "pstack root presets cannot be used with Agent Teams"。两者都接管委派与任务协调，pstack 根 preset 启动失败。',
    recovery:
      "禁用 @deepseek-ai/dsh-experimental-agent-team-profile，或改用不加载 pstack 根 preset 的 profile（standard / Creator preset）。不要让 Agent Teams 与 pstack 根 preset 在同一 profile 共存。",
  },
  turns: [
    {
      prompt: "同时启用 Agent Teams 与 pstack 根 preset 会怎样？",
    },
  ],
  workspace: { files: {} },
  observations: [
    {
      id: "startup-conflict-log",
      description:
        'web 启动日志或进程错误含 "Agent Teams" 与 "preset" 关键词，证明根 preset 的启动守卫按预期拒绝与 Agent Teams 共存。',
    },
  ],
  source: {
    upstreamSkill: "cordis.patch.yml",
    regression:
      '根 preset 行 dsh-pstack/poteto-mode 的 assertNoAgentTeams 守卫：ctx.get("agentTeams") 存在时抛 AGENT_TEAMS_CONFLICT（src/poteto-mode.ts）。',
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
