/**
 * The bundled pstack scripts `pstack_script` may run.
 *
 * Each `assetPath` is relative to `dist/pstack/`, and each id is a closed member of the
 * tool's `id` enum. There is no path argument anywhere: a call can name only an artefact
 * this package ships.
 */

export interface ScriptEntry {
  readonly id: string;
  /** Path below `dist/pstack/`. */
  readonly assetPath: string;
}

export const SCRIPT_ENTRIES: readonly ScriptEntry[] = [
  { id: "check-plan", assetPath: "skills/poteto-mode/scripts/check-plan.mjs" },
  { id: "watch-pr", assetPath: "skills/poteto-mode/scripts/watch-pr/watch-pr.mjs" },
  { id: "worktree-audit", assetPath: "skills/poteto-mode/scripts/worktree-audit.mjs" },
  { id: "log", assetPath: "skills/show-me-your-work/scripts/log.mjs" },
  { id: "statechart", assetPath: "skills/statechart/scripts/statechart.mjs" },
];
