# Playground run-matrix model

Replaces the earlier folder-split model. One probe definition per capability.
Treatment and environment are run dimensions. DSH and pstack versions are run identity
and invalidation axes. Every status/analysis view is generated from records. Stage
isolation is enforced by authorship, not by directories.

## 1. Identity

- `treatment`: `native` | `adapted`. Replaces the earlier `Phase` type and its per-run field.
  - `native`: no `dsh-pstack` plugin, observe the DSH runtime.
  - `adapted`: load `dsh-pstack` and `port/dsh.md`, verify the port.
- `environment`: id from `environments.ts` (`base`, `render`, `agent-team`). Optional
  plugins and team mode belong here, not in a directory name.
- Run record carries `treatment`, `environment.matrix.id`, `environment.dshVersion`,
  and `environment.pstackVersion`.
- `pstackVersion`: the released pstack version pinned in `port/baseline.json`, recorded
  per run. `upstreamRevision` is kept only for reproducibility, never as an identity key.

## 2. Scenario definition

- One file per capability under `playground/scenarios/` (flat). Delete the
  `capabilities/`, `render/`, `agent-team/` directory split and all re-export stubs.
- `BehaviorScenario` keeps `capability`, gains optional `treatments` (default both) and
  `environments` (default `["base"]`). A render probe declares `environments: ["base",
  "render"]` on its one definition.
- `registry.ts` collects every scenario file; it no longer infers an environment from a
  directory and no longer requires per-environment directories.

## 3. Evidence layout

- `playground/reviews/<treatment>-<environment>/scenarios/<scenarioId>/record.json` and
  `screenshot.png`.
- `playground/reviews/<treatment>-<environment>/manifest.json` records treatment,
  environment, `dshVersion`, `pstackVersion`, `scenarioIds`.
- No hand-written `index.md` per snapshot.

## 4. Generated vs hand-written

- Generated (must support `--check` so they cannot drift): per-cell status table and the
  cross-cell pivot (`playground:status-table`), README badges and Requires, compare
  report.
- Hand-written: probe definitions; `findings/<treatment>.md` root-cause Q&A tagged by
  capability; `dsh.md` / `port/dsh.md` review.

## 5. Commands

- `run-batch --treatment native|adapted --environment ID (--full|--scenarios|--only-failed)`.
- `prepare` / `bootstrap` / `stop` / `browser` / `collect` take `--treatment`.
- `review --apply|--check` writes `semanticReview` back and recomputes `verdict`.
- `status-table` pivots records; `compare` compares by `(dshVersion, pstackVersion,
  scenario content hash, environment, model route)`, never `upstreamRevision`.

## 6. Invariants

- Stage isolation: a native analysis reads only native cells; an adapted analysis reads
  only adapted cells; the merge in generated views is read-only. Each cell carries its
  authoring treatment as provenance.
- Comparability: same `dshVersion`, same scenario content hash, same environment, same
  model route. `pstackVersion` is adapted provenance, not a hard equality for native
  behavior.
- Generated artifacts carry `--check` guards.

## 7. Deletion policy (no legacy)

Delete: the `Phase` type and its per-run identifier; the scenario directory split and
re-export stubs; per-snapshot `index.md`; the committed `reviews/*` snapshots (known
stale: raw captured at pstack 0.15.36); any compatibility shims or dual-read paths. Git
history is the archive. Re-capture evidence after the rewrite.

## 8. Verification gates

- After each unit: `vp run typecheck`, `vp run playground:typecheck`, `vp test` all green.
- Final: no legacy per-run identifier remains in `playground/`, `src/`, `skills/`; no
  `scenarios/render/` or `scenarios/agent-team/` directories; docs updated to the new
  commands and model.
