### Eval

**You own the experiment design. Plan, blind, run, synthesize.**

**Non-negotiables for blinding:**

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in any directory, file, or prompt the candidate sees.
- The candidate prompt looks like an organic user request. State the goal, not the meta.
- No chain-eliciting cues. Don't ask the candidate to list which skills, principles, or files they applied. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick.
- Don't tell the candidate other candidates exist.
- The judge can know it's judging but sees outputs by sanitized label only, never by model name.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from.

**Steps:**

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from candidates.
2. **Set up sanitized environments.** Per-candidate working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the candidate would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Start N parallel candidates** with `pstack_subagent`, one per configured model, following `arena` Phase B; read its `SKILL.md` at its absolute resource path. Each works in its own sanitized dir. Same prompt to each. Pick each subagent's role per the Subagents section of `poteto-mode`; read its `SKILL.md` at its absolute resource path.
5. **Start one blinded judge** with `pstack_subagent` on a role from a different provider or model family, following `arena` Phase C; read its `SKILL.md` at its absolute resource path. The judge sees outputs by sanitized label and the rubric, never a model name. When no other family is configured, record the route that actually ran and treat the comparison as same-model.
6. **Verify the chain from raw events, not self-report.** Read each candidate child with `pstack_history` (`scope: "children"`, then that child's `sessionId`), paging the log and pinning `throughSeq`. Look at the `tool/call` events for the files each candidate actually opened and the tools it ran, then grade chain-following from those events plus the shape of the code, never from the candidate's own claims. A candidate whose log you cannot read is unverified on this criterion, not passing it.
7. **Read every candidate output yourself** end to end. Compare to the judge's verdict. Disagreement means a model is biased or the rubric is ambiguous. Synthesize.

**Reply:** variant under test, rubric, per-candidate notes, judge's verdict, your synthesis, and a recommendation for whether to promote the variant.
