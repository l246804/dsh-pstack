---
name: playground-verify
description: Run the full dsh-pstack playground verification loop on a fresh machine, from environment prep through the raw audit round, the adapted regression rounds, and the convergence rerun.
disable-model-invocation: true
---

# Run playground verification

Drive the playground through the whole verification loop against a real DSH Web session. It ends with an audit report whose every evidence path exists. Report names carry no stage number: the pending-approval audit is `reports/skill-audit.md`, a run is `reports/run-raw-<date>.md` or `reports/run-adapted-<date>.md`.

## 1. One-time machine setup

Run these steps once per machine. Skip the whole section when `dsh` is on PATH, `playground/config.json` is filled, and the plugin build is current. Repeat `vp install` and `vp run build` only after dependencies or plugin source change.

1. `vp install`.
2. Follow `port/AGENTS.md` to stage the generated tree, then `vp run build`.
3. Confirm `dsh` is on PATH.
4. Copy the contents of `playground/config.example.json` into `playground/config.json` and fill the real provider and apiKey. Every script that needs it fails loudly when it is missing or empty, and the file is ignored by git.

## 2. Prepare workers each round

Run this every round. Worker count is detected from the machine unless overridden. Each worker owns `playground/.workers/w<k>/` with its own DSH home, browser profile, workspace root and evidence dir, and binds an OS-assigned port from `dsh --port 0`. There is no fixed port.

```sh
vp run playground:prepare -- --mode raw --reset
vp run playground:prepare -- --mode raw --reset --workers 6
```

## 3. Land the browser profile

```sh
vp run playground:bootstrap -- --all
```

## 4. Raw round

Run every runnable skill case with the short probe, 120 seconds for principle cases and 300 for behavior cases. The probe aborts the in-flight turn and marks evidence truncated.

```sh
vp run playground:run-batch -- --mode raw --all
vp run playground:status
vp run playground:collect -- --mode raw
```

Collect writes `reports/run-raw-<date>.md` and archives the round's evidence under `reports/evidence/<round>-<date>/`. Every row names its archived evidence file.

Then write the audit report `reports/skill-audit.md`, one section per skill. Each section states the upstream capability and the current status and gap, and leaves two empty rows for the operator to fill during approval: the suggested dsh.md adaptation and the suggested plugin tools. Status starts at pending approval. Do not pre-fill the suggestions. Stop here and hand the report to the operator for per-section approval. Record each approval with `vp run playground:approve -- --skill <a>,<b> --round <n>`; it writes the skill's approved fields and the report shows the status.

## 5. Adapt after approval

For each approved section, fill in and implement the operator's suggested dsh.md adaptation and plugin tools, then build the shippable plugin.

```sh
vp run build
```

## 6. Adapted regression rounds

The first adapted round rebuilds the worker profile with the freshly built plugin while keeping the raw evidence. Do not pass `--reuse` on that first round, or the workers keep the old raw profile. In adapted rounds run-case selects the `poteto-mode` preset in the composer before sending, so the model carries the skill routing instructions; raw rounds stay on the standard preset.

```sh
vp run playground:prepare -- --mode adapted --workers 4
vp run playground:run-batch -- --mode adapted --only-failed
vp run playground:collect -- --mode adapted
```

Later rounds restart the same workers without touching profiles, workspaces or evidence.

```sh
vp run playground:prepare -- --mode adapted --reuse --workers 4
vp run playground:run-batch -- --mode adapted --only-failed --round 2
vp run playground:run-batch -- --mode adapted --skills <a>,<b>
```

`--only-failed` reads the latest evidence across archived rounds and selects cases whose verdict failed or whose run ended in an infra error. `--skills` maps skill names to their cases. `--round` sets the round written to progress. Progress in `playground/status` and `playground/.workers/progress.json` carries the round number.

Classify each failure and act.

- Implementation defect: fix the implementation, `vp run build`, restart the affected workers, rerun the affected cases.
- Case defect: fix the case, update `cases.lock.json`, rerun that case.
- Environment error: retry once automatically; if it fails again, investigate.
- True residual: record it in the audit report residual row with the reason and do not rerun.

Repeat until a round has no implementation defect and every remaining item is a declared residual.

## 7. Convergence rerun

After convergence, run one full adapted pass over all cases once, so no case is left unverified.

```sh
vp run playground:prepare -- --mode adapted --reuse
vp run playground:run-batch -- --mode adapted --all
vp run playground:collect -- --mode adapted
```

Pass when every case passes or every non-passing case is a declared residual with a reason. If the full pass surfaces a new implementation defect, return to step 6.

## 8. Close the report

Update every section of `reports/skill-audit.md` to its final state, passed or residual with the reason, and record the round and status in `cases.lock.json`. The next round starts from step 5.

## Conventions

- Case prompts stay natural user requests. Never name a tool or expand call arguments.
- No human answers questions in a run. run-case answers any ask_user_question card itself: a case's own `answers` rules win, otherwise it takes the first option or types the default text, and every answer is recorded in the evidence.
- Model choice is the operator's. Confirm it once per machine; the agent cites session events as evidence.
- The upstream skill set and per-skill case mapping live in `playground/cases.lock.json`. `vp run playground:check` fails on drift.
- Cursor-only handling follows `playground/AGENTS.md` and the lock: only a skill that depends on a Cursor-only capability is excluded and gets no case; a skill that merely mentions one is recorded in `CURSOR_MENTION_REVIEWED` and stays runnable. `--all` covers every runnable case.
