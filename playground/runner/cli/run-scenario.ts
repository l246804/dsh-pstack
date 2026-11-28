import { requiredArg, variantArg, workerArg } from "../shared/args.ts";
import { DEFAULT_CONFIG_FILE } from "../shared/paths.ts";
import { readConfig } from "../config/config.ts";
import { loadScenario } from "../scenario/scenarios.ts";
import { runScenario } from "../execution/scenario.ts";

async function main(): Promise<void> {
  const record = runScenario({
    variant: variantArg(),
    environment: requiredArg("--environment"),
    worker: workerArg(),
    scenario: loadScenario(requiredArg("--scenario")),
    config: await readConfig(DEFAULT_CONFIG_FILE),
  });
  console.log(
    `[run-scenario] ${record.scenarioId} ${record.variant} ${record.environment.matrix.id} ${record.status}`,
  );
  console.log(`[run-scenario] record=${record.artifacts.recordFile}`);
  for (const answer of record.session?.autoAnswers ?? []) {
    console.log(`[run-scenario] auto-answered "${answer.question}" -> ${answer.answer}`);
  }
  console.log(
    "[run-scenario] assess the rubric and record the conclusion in results/<scenario>/result.md",
  );
  process.exitCode = record.status === "completed" ? 0 : record.status === "blocked" ? 2 : 1;
}
main().catch((error: unknown) => {
  console.error(`[run-scenario] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
