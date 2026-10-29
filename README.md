<p align="center">
  <img src="./assets/logo.png" width="144" alt="dsh-pstack logo" />
</p>

<h1 align="center">dsh-pstack</h1>

<p align="center">
  <strong>Bring pstack's rigorous agent workflows to DeepSeek Harness</strong>
</p>

<p align="center">
  English · <a href="./README.zh.md">中文</a>
</p>

<p align="center">
  <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/v/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm version" /></a>
  <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/dm/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm downloads" /></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-0.2.2--alpha.2-1f6feb?style=flat-square" alt="dsh 0.2.2-alpha.2" /></a>
  <a href="https://github.com/cursor/plugins/tree/main/pstack"><img src="https://img.shields.io/badge/pstack-0.15.36-d97706?style=flat-square" alt="pstack 0.15.36" /></a>
</p>

<p align="center">
  <a href="https://github.com/l246804/dsh-pstack/blob/main/LICENSE"><img src="https://img.shields.io/github/license/l246804/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="license" /></a>
  <a href="https://bundlephobia.com/result?p=dsh-pstack"><img src="https://img.shields.io/bundlephobia/minzip/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669&label=minzip" alt="minzip size" /></a>
  <a href="https://www.jsdocs.io/package/dsh-pstack"><img src="https://img.shields.io/badge/jsdocs-reference-080f12?style=flat-square&colorA=080f12&colorB=1fa669" alt="JSDocs" /></a>
</p>

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>58</strong><br /><sub>pstack skills</sub></td>
      <td align="center"><strong>23</strong><br /><sub>playbooks</sub></td>
      <td align="center"><strong>4</strong><br /><sub>native tools</sub></td>
      <td align="center"><strong>2</strong><br /><sub>agent presets</sub></td>
      <td align="center"><strong>5</strong><br /><sub>bundled scripts</sub></td>
    </tr>
  </table>
</div>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#capabilities">Capabilities</a> ·
  <a href="#skills-directory">Skills directory</a> ·
  <a href="#optional-dsh-plugins">Optional DSH plugins</a> ·
  <a href="#compatibility">Compatibility</a>
</p>

`dsh-pstack` ports [pstack](https://github.com/cursor/plugins/tree/main/pstack) to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). It keeps the upstream pstack skills, playbooks, and reference documents, maps Cursor's tool names, subagent fields, model slugs, and paths to DSH, and fills the interfaces DSH lacks with four native tools.

Most upstream pstack skills declare `disable-model-invocation: true`. `poteto-mode` needs to route to those hidden skills by name, while DSH's `skill` tool only exposes the model-visible catalog. Cursor's model slugs, `subagent_type`, `readonly`, and Bun scripts have no DSH equivalents either. dsh-pstack keeps those differences in the plugin layer, so you can start from entries such as `/poteto-mode` right after installation.

See [`pstack/README.md`](./pstack/README.md) for the full capability map, gaps, and acceptance status.

## Quick start

```sh
dsh plugin --profile web add dsh-pstack
```

You can also install it from the Plugins page in Web or Desktop. After installation, restart the profile or open a new Session.

Run this once before first use:

```text
/setup-pstack
```

It reads the providers, models, and reasoning efforts the current deployment actually offers and writes them to `$DSH_HOME/poteto-models.mdc`. When the file is missing, every role inherits the parent's routing.

### Common entry points

| Command | Purpose |
|---|---|
| `/poteto-mode` | Main workflow entry: matches a playbook to the task and maintains todos and evidence. |
| `/setup-pstack` | Configures role models and initializes the pstack environment. |
| `/how`, `/why`, `/teach` | Architecture walkthrough, evidence investigation, and progressive explanation. |
| `/architect`, `/arena`, `/swarm` | Multi-option design, parallel candidates, and slice-parallel implementation. |
| `/create-verification-skill` | Generates a verification skill for a real project. |
| `/statechart` | Checks state models with TLA+ and TLC, and outputs a Mermaid state diagram. |
| `/show-me-your-work` | Maintains a TSV decision log and audits the current work. |
| `/retro` | Reviews a coding session's environment. |

## Capabilities

### Native tools

| Tool | Purpose |
|---|---|
| `pstack_skill` | Loads a hidden skill registered by this plugin by name, and reads relative resources inside the skill directory. |
| `pstack_models` | Read-only list of the providers, models, and efforts DSH actually offers, used by `/setup-pstack`. |
| `pstack_subagent` | Reads `$DSH_HOME/poteto-models.mdc` per role, parses `provider/model [effort]`, selects a preset by `agent`, and can start several subagents at once. |
| `pstack_script` | Runs bundled Node scripts by fixed id without Bun or shell scripts. |

The `poteto-agent` and `comment-sicko` presets handle implementation delegation and read-only comment review. `pstack_script` can run five bundled scripts—`check-plan`, `watch-pr`, `worktree-audit`, `log`, and `statechart`—whose ids are a closed enum and cannot be used to build arbitrary paths.

## Skills directory

`skills/` is not an upstream pstack directory. It only collects skills that pstack does not provide but real project development needs. The source directories are `skills/authored/` and `skills/.agents/skills/`; after the build they are published to `dist/skills/authored/` and `dist/skills/vendored/`. `vendored` preserves open-source upstreams verbatim, while `authored` is maintained in this repository. pstack skills only reference them; that usage does not change the inclusion criteria.

| Source | Skill | Purpose | Engineering capability added |
|---|---|---|---|
| `vendored` | `writing-for-agents` | Writes skills, `AGENTS.md`, `CLAUDE.md`, and documents referenced by pointers, covering context pointers, information hierarchy, and progressive disclosure. | Makes an agent document's trigger words, load order, and context cost predictable, and adds the writing path that Cursor's `create-skill` provides. |
| `vendored` | `retro` | Reviews a coding session's environment, checking navigation, automation, coding conventions, tool economy, and information access. | Adds the environment check that pstack `/reflect` and `/correct` do not cover; it only reports and does not modify the repository. |
| `authored` | `decision-write` | Writes, lands, and supersedes decision records in Draft and Land modes, requiring `Status` and `Implemented-by` to appear together. | Adds the decision lifecycle that real projects often lack. |
| `authored` | `decision-audit` | Read-only audit of decision-record routing, status, scope, anchors, and supersession relationships. | Keeps decision records searchable and reviewable over time. |
| `authored` | `setup-project-docs` | Sets up architecture, glossary, decisions, and the root `AGENTS.md` pointers, and can be run repeatedly to fill gaps. | Gives a new project a sustainable documentation entry point. |

`vendored` skills come from `mattpocock/skills@59db609eb1e18aaf59b63284d0e52255aff0c63c`; sources, paths, and hashes are recorded in [`skills/skills-lock.json`](./skills/skills-lock.json). Both skill trees ship with the package, but they do not correspond to upstream pstack versions.

## Optional DSH plugins

The following plugins ship with DSH and are disabled by default; they are not installation dependencies of dsh-pstack. They determine whether some pstack flows can run end to end. To enable one, enter its package name in **Add plugin** on the Plugins page, or run `dsh plugin --profile <profile> add <package>`, then restart the profile.

### Sessions and isolation

| Plugin | Capability when enabled | Boundaries and conflicts |
|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | Five read-only tools—`session_search`, `session_event_search`, `session_trace`, `session_event_trace`, and `session_event_read`—search and trace historical sessions, serving `/recall`, `/reflect`, and `/show-me-your-work`. | Matches only sessions with the same `cwd`; use `session_event_search` for the current session; there is no Cursor `.jsonl` transcript path. |
| `@deepseek-ai/dsh-experimental-worktree`<br />`@deepseek-ai/dsh-experimental-tool-worktree` | `create_worktree` creates a local branch and worktree and switches the current Session directory, isolating parallel candidates for `/arena`, `/swarm`, and `/architect`. | `from` reads only local refs and does not fetch; there is no cloud VM; creating worktrees repeatedly changes `cwd`; it does not automatically give each subagent its own tree. |
| `@deepseek-ai/dsh-experimental-forge-bundle` | PR panel, checks, review, mark ready, merge, and Session binding, plus starting a Session from the composer with a new worktree, serving `/babysit`, `/shipping`, and `/autopilot-*`. | GitHub only, requires `gh` login; there is no take tool on the model side; there is no stack verdict; it can coexist with the worktree bundle. |

### Verification and evidence

Choose one of three browser providers: `@deepseek-ai/dsh-experimental-browser-use-stagehand-native`, `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`, or `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp`.

| Plugin | Capability when enabled | Boundaries and conflicts |
|---|---|---|
| `@deepseek-ai/dsh-browser-use` + one provider | Navigation, clicking, typing, screenshots, and ARIA snapshots; Stagehand also provides act, find, and extract, for verification skills and UI reproduction. | The base package does nothing without a provider; one provider per Session; screenshots need an image model; no video; Stagehand needs Chromium and a non-DeepSeek model. |
| `@deepseek-ai/dsh-cua-bundle` | macOS app clicking, typing, screenshots, and permission pages, for desktop app verification. | macOS PTC only; Windows is incomplete; no video. |
| `@deepseek-ai/dsh-experimental-terminal-bundle` | Six global terminal tools that keep a shell or REPL alive across calls and support background send, for CLI and TUI verification. | Terminal only; added to every Agent; persistent state must be cleaned up; switching invalidates the KV cache. |
| `@deepseek-ai/dsh-mcp-client` | Mounts MCP servers; tools appear as `mcp__<server>__<tool>`, and `mcp-resources` lists servers with resources, serving evidence investigation for `/why` and `/teach`. | No default server; configuration is per server; no automatic category discovery. |

### Multi-agent

| Plugin | Capability when enabled | Boundaries and conflicts |
|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team-profile` | Lead and teammate roles, a shared task board, nine team tools, and a Web roster, serving `/orchestrate` and `/autopilot-*`. | Hard conflict: disables `subagent` and `subagent_fork`; forms two entry points with `pstack_subagent`, so keep only one per profile. |
| `@deepseek-ai/dsh-experimental-ralph-bundle` | Global `ralph`, a foreground loop with a fresh child each round, serving `/autonomous-run`. | Not a persistent loop in the same Session; no event watcher; does not replace goals, heartbeats, or the decision log. |

## Compatibility

| Item | Version | Notes |
|---|---|---|
| DSH | `0.2.2-alpha.2` | `engines.dsh` requires an exact match |
| pstack | `0.15.36` | Upstream baseline commit `1ba91fc` |
| Node.js | `>=24.21.1` | Runtime requirement |
| Cordis | `~4.0.6-alpha.1` | Peer dependency |

`engines.dsh` accepts only this DSH version. After upgrading DSH, experimental plugin package names, tool names, and configuration may change; verify in a test profile first. Upgrading upstream pstack requires regenerating the tree and rechecking the adaptation table.

`pstack_script` runs on the Host's Node, bypassing bash approval and the filesystem sandbox, and is treated as a trusted entry point. A worktree session's `cwd` differs from the original session; session-search matches exact `cwd`, so search old sessions from their original directory.

When optional plugins are not enabled, pstack skills still load. Steps that need a plugin print `Skipped in DeepSeek Harness: <step>. <reason>.` and continue. Without `gh`, Java/TLC, or video tools, the corresponding steps report blocked or degrade to screenshots; they do not mark an unrun step as passed.

## How it works

Upstream pstack adapts Claude Code with `docs/harness/claude-code.md`. Skill bodies are not rewritten; a separate host adaptation table maps `Task`, `AskQuestion`, todo, model slugs, and paths to the target host item by item. The generator only inserts a one-line DSH adaptation note at the start of skills that need Cursor names mapped; capabilities the platform does not support are skipped with `Skipped in Claude Code: <step>. <reason>.`

dsh-pstack follows the same approach. The main adaptation document becomes [`pstack/harness/docs/harness/dsh.md`](./pstack/harness/docs/harness/dsh.md), covering six domains: Tools, Subagent fields, Models, setup-pstack, Paths, and Cursor-only features. Fields DSH lacks are filled by `pstack_*` tools, agent presets, and Node scripts. At build time, upstream pstack and the local adaptation tree are rendered into `pstack/pstack/`, then packaged with `src/*.ts` and `skills/` into `dist/`.

## Credits

- [pstack](https://github.com/cursor/plugins/tree/main/pstack) was designed and open-sourced by Lauren Tan and the Cursor team. `poteto-mode`, the 23 playbooks, and the 24 principles all come from upstream.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is provided by the DeepSeek team. DSH's plugin, bundle, agent preset, subagent, and tool host interfaces let this port land as native tools.
- [mattpocock/skills](https://github.com/mattpocock/skills) provides the vendored `writing-for-agents` and `retro` skills.

This project is a community port, not an official Cursor or DeepSeek release. Upstream pstack and DSH are both MIT licensed.

## License

[MIT](./LICENSE) License © [leiwang](https://github.com/l246804)
