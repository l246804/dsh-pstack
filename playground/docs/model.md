# Playground run-matrix model

One probe definition per capability.
Treatment and environment are run dimensions. DSH and pstack versions are run identity
and invalidation axes. Every status/analysis view is generated from records. Stage
isolation is enforced by authorship, not by directories.

## 1. Identity

- `treatment`: `native` | `adapted`.
  - `native`: no plugin under test, run the DSH standard runtime only. This is the implementation-neutral baseline: it never loads the plugin under test, so re-running it after a DSH update reveals capabilities DSH has since made native, and it cannot be coupled to the current implementation.
  - `adapted`: load the plugin under test and its adapter configuration, verify the adaptation.
- `environment`: id from `environments.ts`; optional plugins and team mode belong to the
  environment definition, never to a directory name.
  - `base` loads no extra plugin and is the default comparison.
  - Optional environments are enabled on demand for comparison only; keep the base result
    for the same probe to tell an environment effect from an adaptation effect.
- Run record carries `treatment`, `environment.matrix.id`, `environment.dshVersion`,
  and `environment.pstackVersion`.
- `pstackVersion`: the released pstack version pinned in `native/upstream.lock.json`, recorded
  per run. `upstreamRevision` is kept only for reproducibility, never as an identity key.

## 2. Evidence layout

- `playground/evidence/runs/<treatment>-<environment>/scenarios/<scenarioId>/<treatment>-<environment>/record.json`
  and `screenshot.png`.
- `playground/evidence/runs/<treatment>-<environment>/manifest.json` records treatment,
  environment, `dshVersion`, `pstackVersion`, `scenarioIds`.

## 3. Generated vs hand-written

- Generated (must support `--check` so they cannot drift): the per-cell status table, the cross-cell pivot, the comparison report, and the gap lock.
- Hand-written: probe definitions; `playground/evidence/findings/<treatment>.md` root-cause Q&A tagged by capability; adapter-answer review.

## 4. Commands

运行命令、批次与参数见 [workflow.md](./workflow.md)；本文件不重复。

## 5. Invariants

- Stage isolation: a native analysis reads only native cells; an adapted analysis reads
  only adapted cells; the merge in generated views is read-only. Each cell carries its
  authoring treatment as provenance.
- Comparability: same `dshVersion`, same scenario content hash, same environment, same
  model route. `pstackVersion` is adapted provenance, not a hard equality for native
  behavior.
- Treatment-neutral scenarios: the same scenario definition runs in native and adapted;
  treatment-specific judging lives in the analysis rules, never in the scenario.
- Generated artifacts carry `--check` guards.
