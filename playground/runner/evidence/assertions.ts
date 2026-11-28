import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Assertion, BehaviorScenario, SessionFacts, TestTarget } from "../types.ts";
/** Resolve an artifact path inside the workspace, or null when it escapes. */
function resolveInWorkspace(workspace: string, relative: string): string | null {
  const target = resolve(workspace, relative);
  return target === workspace || target.startsWith(`${workspace}/`) ? target : null;
}

function directoryHasFiles(directory: string): boolean {
  return readdirSync(directory, { recursive: true, withFileTypes: true }).some((entry) =>
    entry.isFile(),
  );
}

export function evaluateAssertions(
  assertions: Assertion[],
  session: SessionFacts,
  workspace: string,
): string[] {
  const failures: string[] = [];
  for (const assertion of assertions) {
    switch (assertion.kind) {
      case "turn-completed": {
        if (session.turnEndReason !== "completed") {
          failures.push(`turn ended with ${session.turnEndReason ?? "no turn/end"}`);
        }
        break;
      }
      case "skill-loaded": {
        const loaded = session.skillLoads.some((entry) => entry.split("#")[0] === assertion.skill);
        if (!loaded) failures.push(`process evidence: ${assertion.skill} was not loaded`);
        break;
      }
      case "no-tool-error": {
        // A retry that recovers is acceptable; only a tool whose last call still
        // failed counts as a real tool error.
        const finalStatus = new Map<string, string>();
        for (const call of session.toolCalls) finalStatus.set(call.name, call.status);
        const errors = [...finalStatus.entries()]
          .filter(([, status]) => status === "error")
          .map(([name]) => name);
        if (errors.length > 0) failures.push(`tool errors: ${errors.join(", ")}`);
        break;
      }
      case "artifact-contains": {
        const target = resolveInWorkspace(workspace, assertion.path);
        if (target === null) {
          failures.push(`artifact escapes workspace: ${assertion.path}`);
        } else if (!existsSync(target)) {
          failures.push(`missing artifact: ${assertion.path}`);
        } else if (!readFileSync(target, "utf8").includes(assertion.text)) {
          failures.push(`artifact ${assertion.path} lacks ${JSON.stringify(assertion.text)}`);
        }
        break;
      }
      case "artifact-exists": {
        const target = resolveInWorkspace(workspace, assertion.path);
        if (target === null) {
          failures.push(`artifact escapes workspace: ${assertion.path}`);
        } else if (!existsSync(target)) {
          failures.push(`missing artifact: ${assertion.path}`);
        }
        break;
      }
      case "artifact-dir-nonempty": {
        const target = resolveInWorkspace(workspace, assertion.path);
        if (target === null) {
          failures.push(`artifact escapes workspace: ${assertion.path}`);
        } else if (!existsSync(target) || !statSync(target).isDirectory()) {
          failures.push(`missing artifact directory: ${assertion.path}`);
        } else if (!directoryHasFiles(target)) {
          failures.push(`artifact directory has no files: ${assertion.path}`);
        }
        break;
      }
      case "artifact-absent": {
        const target = resolveInWorkspace(workspace, assertion.path);
        if (target === null) {
          failures.push(`artifact escapes workspace: ${assertion.path}`);
        } else if (existsSync(target)) {
          failures.push(`unexpected artifact: ${assertion.path}`);
        }
        break;
      }
      case "assistant-contains": {
        if (!session.assistantText.includes(assertion.text)) {
          failures.push(`assistant reply lacks ${JSON.stringify(assertion.text)}`);
        }
        break;
      }
    }
  }
  return failures;
}

export function assertExpectedEntry(
  scenario: BehaviorScenario,
  session: SessionFacts,
  target: TestTarget,
  expectedPreset: string,
): string[] {
  const failures: string[] = [];
  if (session.userText !== scenario.turns[0]?.prompt)
    failures.push("natural-language entry differs");
  if (session.agentPreset !== expectedPreset) failures.push(`expected preset ${expectedPreset}`);
  if (!target.provider || !target.model || !target.effort)
    failures.push("actual model route is missing");
  return failures;
}

export function expectedWorkspace(workspace: string, session: SessionFacts): string[] {
  return session.workspacePath !== null && session.workspacePath !== workspace
    ? [`session ran in ${session.workspacePath}, expected ${workspace}`]
    : [];
}

/**
 * Mechanical failures from the actual session, workspace and configured model route.
 * Semantic conclusions are made separately against the scenario rubric.
 */
export function mechanicalFailures(input: {
  scenario: BehaviorScenario;
  session: SessionFacts;
  workspace: string;
  sessionWorkspace: string;
  route: TestTarget | null;
  expectedTarget: TestTarget;
  expectedPreset: string;
}): string[] {
  const failures = [
    ...evaluateAssertions(input.scenario.assertions, input.session, input.workspace),
    ...expectedWorkspace(input.sessionWorkspace, input.session),
    ...assertExpectedEntry(
      input.scenario,
      input.session,
      input.route ?? { provider: "", model: "", effort: "" },
      input.expectedPreset,
    ),
  ];
  const expectedRoute = {
    provider: input.expectedTarget.provider,
    model: input.expectedTarget.model,
    effort: input.expectedTarget.effort,
  };
  if (JSON.stringify(input.route ?? null) !== JSON.stringify(expectedRoute)) {
    failures.push("actual model route differs from testModel");
  }
  return failures;
}
