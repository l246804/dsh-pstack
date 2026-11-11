---
name: playground-verify
description: Run the full dsh-pstack playground verification loop on a fresh machine, from raw baseline generation through semantic review, adapted regression, the official-plugin matrix, plugin UI checks, and the final full rerun.
disable-model-invocation: true
---

# Run playground verification

Drive the playground through the full test-driven port against real DSH Web sessions. Raw evidence decides the adaptation; adapted evidence proves it. There is no case lock and no approval file: reviews live in `playground/reviews/` sidecars, and the release compatibility key lives in `playground/baseline.json`.

## 1. One-time machine setup

1. `vp install`.
2. Confirm `dsh` is on PATH and `agent-browser` has Chromium available.
3. Copy `playground/config.example.json` to `playground/config.json`, fill `providers` and `testModel` (provider/model/effort). The file is ignored and every script fails loudly when it is missing. Do not commit it.
4. `vp run playground:raw-generate` builds the isolated raw tree from upstream plus `playground/raw/dsh.md`.

## 2. Raw discovery round

```sh
vp run playground:prepare -- --phase raw --environment base --workers 4 --reset
vp run playground:bootstrap -- --worker 0 --environment base
vp run playground:run-batch -- --phase raw --environment base --all
vp run playground:collect -- --phase raw --environment base
vp run playground:status -- --phase raw --environment base
```

raw only allows the `base` environment with no extra plugins. It uses the standard preset plus the raw `systemPrompt` injection from `playground/raw/dsh.md`. Every scenario waits for real `turn/end`; there is no probe, timeout abort, or truncated state.

Then review the evidence semantically. Each scenario needs a sidecar `playground/reviews/<scenarioId>-<phase>-<environmentId>.json`:

```json
{
  "status": "supported",
  "reason": "which artifacts and replies were checked, and why the rubric holds or not",
  "reviewer": { "kind": "model", "route": { "provider": "...", "model": "...", "effort": "..." } },
  "reviewedAt": "2026-11-11T00:00:00Z"
}
```

```sh
vp run playground:review            # validate sidecars, list pending
vp run playground:review -- --apply # merge into append-only RunRecord revisions
```

A sidecar older than the latest recapture is stale and is skipped. Never merge an old review onto new evidence.

## 3. Implement the adaptation

Use the raw findings to update `port/dsh.md` and `port/dsh.zh.md`. The generator copies upstream and inserts the adapter reference line; it never rewrites upstream prose. All adaptation lives in the adapter document.

```sh
vpx port/generate.mjs
vp run build
```

## 4. Adapted regression rounds

```sh
vp run playground:prepare -- --phase adapted --environment base --workers 4 --reset
vp run playground:run-batch -- --phase adapted --environment base --only-failed
vp run playground:collect -- --phase adapted --environment base
```

adapted loads the built `dsh-pstack` and selects the `poteto-mode` preset; it does not inject the raw prompt. Review the adapted evidence with the same sidecar flow and apply it. Repeat `--only-failed` (not-verified or inconclusive cases) until no implementation defect remains, then run one full adapted pass over all scenarios.

## 5. Official-plugin matrix and UI

The environments live in `playground/scenarios/environments.ts`: `base`, `session-search`, `browser-use`, `terminal`, `forge`, `agent-team-conflict`. Prepare and run each relevant environment with the same scenario ids.

```sh
vp run playground:prepare -- --phase adapted --environment session-search --workers 1 --reset
vp run playground:run-batch -- --phase adapted --environment session-search --scenarios <ids>
vp run playground:run-conflict -- --environment agent-team-conflict
vp run playground:run-ui -- --worker 0 --scenario plugin-ui-role-config --environment base --packages dsh-pstack
vp run playground:run-ui -- --worker 0 --scenario plugin-ui-recommended-plugins --environment base --packages dsh-pstack
```

Environments that declare `versionExemptions` need the exact-version grant; `prepare` performs it from the installed version and runtime version. Agent Teams is a conflict regression, not a supported combination: the Web app starts, and the `poteto-mode` preset must show a load failure with `AGENT_TEAMS_CONFLICT`.

## 6. Finish

After the matrix and UI checks, run one clean full pass of raw and adapted evidence, collect both reports, and review every sidecar. A run passes only when every adapted scenario is verified or is a declared environment-blocked item with evidence, and every schema, coverage, and build check is green.

## Conventions

- Scenario prompts stay natural user requests. Never name a tool or expand call arguments.
- No human answers questions during a run. `run-case` answers `ask_user_question` itself: a scenario's own `answers` rules win, otherwise the first option or a default text is used, and every answer is recorded.
- Model choice is the operator's. Record the actual route in every RunRecord.
- Skill loading is process evidence only. The semantic review decides whether the skill's effect is real; pending never counts as a pass.
- raw has four states: observed, gap, blocked, unobserved. adapted has three: verified, not-verified, inconclusive.
- Do not restore cases.lock, the approval flow, old SkillCase, Finding, or `reports/skill-audit.md`.
