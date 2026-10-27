# writing-for-agents

This skill is vendored, not written here. It came from `mattpocock/skills` at commit
`5beb35b`, path `skills/productivity/writing-for-agents`, under the MIT licence. The
exact pin, file hashes, and licence text live in `scripts/skills-ext/sources.yml`.

`SKILL.md` and `SKILL-MECHANICS.md` are upstream text, copied byte for byte. Do not
edit them in place: an edit breaks the recorded hash and `pnpm run check` fails. To
carry a local change, add it to `scripts/skills-ext-patches.ts` and raise `adapt` in
the manifest. To adopt a newer upstream revision, change `revision` and run
`pnpm run skills-ext:pin`.

## When a local skill has the same name

A skill you write yourself wins. DSH resolves duplicate names by rank, lowest first,
and every local layer sits below this package:

| Rank | Where the skill lives |
| --- | --- |
| 100 | `<repo>/.dsh/skills/<name>/` |
| 200 | `<repo>/AGENTS.md` skill entries |
| 400 | `$DSH_HOME/skills/<name>/` |
| 500 | `$DSH_HOME/AGENTS.md` skill entries |
| 600 | this package |

So a `writing-for-agents` skill in your project shadows this one completely: yours is
loaded, this one is not, and nothing reports the collision. That precedence is
deliberate, because a project's decision should beat a package default. The cost is
that the override is silent, so after an upgrade that changes behaviour, check for a
same-name skill before assuming this package is at fault. Delete or rename your copy
to get this one back.

This package's own two trees may not collide: the same name in `assets/skills/` and
`assets/skills-ext/` fails plugin startup rather than letting one win quietly.
