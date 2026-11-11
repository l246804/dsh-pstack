import type { BehaviorScenario } from "../types.ts";

export const noComments: BehaviorScenario = {
  type: "behavior",
  id: "no-comments-handler-cleanup",
  skill: "no-comments",
  turns: [
    {
      prompt:
        "提交前帮我把 src/handler.ts 里多余的注释清理一下，只删那些复述代码、没信息量的注释，代码逻辑一行都别动，确实解释原因、不得不留的注释要保留。清理完把被你删掉的注释原文列在 clean-report.md 里给我看。",
    },
  ],
  workspace: {
    files: {
      "src/handler.ts": [
        "export async function handle(request: Request): Promise<Response> {",
        "  // get the user from the request",
        "  const user = await loadUser(request.userId);",
        "",
        "  // check if the user is active",
        "  if (!user.active) {",
        "    // return unauthorized",
        '    return new Response("forbidden", { status: 403 });',
        "  }",
        "",
        "  // Poll once more because the upstream API returns 202 before the row is",
        "  // committed, and reading too early returns a stale row.",
        "  const record = await waitForPersisted(request.recordId);",
        "",
        "  // return the record",
        "  return Response.json(record);",
        "}",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    {
      kind: "artifact-contains",
      path: "clean-report.md",
      text: "get the user from the request",
    },
    { kind: "artifact-contains", path: "src/handler.ts", text: "committed" },
    { kind: "assistant-contains", text: "注释" },
  ],
  rubric: {
    prompt:
      "目标是在评审前清掉复述代码的冗余注释，同时保住真正解释原因的那条。合格结果要：删除类如“get the user from the request / check if the user is active / return unauthorized / return the record”这类废话注释，保留解释“为什么轮询一次”的那条（上游先返回 202、早读会拿到旧行），代码逻辑不变，并在 clean-report.md 列出被删注释原文。只加载技能、或把解释原因的注释一起删掉、或改了代码逻辑，都不算效果成立。若保留了废话注释或删掉了关键 why 注释，记为缺口。",
  },
  uiObservations: [
    {
      id: "completed-turn",
      description: "会话自然结束，没有自动点击停止；若派了子代理，其过程在会话时间线可见。",
    },
    {
      id: "cleanup-visible",
      description:
        "工作区能看到 src/handler.ts 只剩解释原因的注释，clean-report.md 列出被删注释原文。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/no-comments/SKILL.md",
    regression:
      "适配后仍要清掉复述代码的注释并保住解释原因的注释、代码逻辑不变；把 why 注释一起删掉或改动逻辑即为回归。",
  },
};
