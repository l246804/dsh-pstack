import type { SessionAnalysis, SessionFacts, ToolAttemptAnalysis } from "../types.ts";

function toolAnalysis(session: SessionFacts): ToolAttemptAnalysis[] {
  const grouped = new Map<string, ToolAttemptAnalysis>();
  for (const call of session.toolCalls) {
    const current = grouped.get(call.name) ?? {
      name: call.name,
      attempts: 0,
      failures: 0,
      firstAttemptStatus: call.status,
      finalStatus: "pending" as const,
      recovered: false,
    };
    current.attempts += 1;
    if (call.status === "error") current.failures += 1;
    current.finalStatus = call.status === "error" ? "error" : "ok";
    current.recovered = current.failures > 0 && current.finalStatus === "ok";
    grouped.set(call.name, current);
  }
  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function analyzeSession(session: SessionFacts): SessionAnalysis {
  const tools = toolAnalysis(session);
  return {
    tools,
    artifacts: session.toolCalls
      .filter((call) => call.name === "write" || call.name === "edit")
      .map((call) => call.argsSummary)
      .slice(0, 20),
    warnings: tools
      .filter((tool) => tool.attempts > 1 && tool.failures > 0)
      .map(
        (tool) => `${tool.name} needed ${tool.attempts} attempts with ${tool.failures} failures`,
      ),
  };
}
