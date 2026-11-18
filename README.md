<div align="center">
  <img src="./assets/logo.png" width="144" alt="dsh-pstack logo" />

  <h1>dsh-pstack</h1>

  <p>
    <strong>Bring pstack's rigorous agent workflows to DeepSeek Harness</strong>
  </p>

  <p>English · <a href="./README.zh.md">中文</a></p>

  <p>
    <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/v/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm version" /></a>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-%3E%3D0.2.2--rc.2-1f6feb?style=flat-square" alt="dsh >=0.2.2-rc.2" /></a>
    <a href="https://github.com/cursor/plugins/tree/main/pstack"><img src="https://img.shields.io/badge/pstack-0.15.43-d97706?style=flat-square" alt="pstack 0.15.43" /></a>
    <a href="https://github.com/l246804/dsh-pstack/blob/main/LICENSE"><img src="https://img.shields.io/github/license/l246804/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="license" /></a>
    <a href="https://dshopen.org/plugins/dsh-pstack/"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fdshopen.org%2Fbadge%2Fdsh-pstack.json%3Flang%3Den&style=flat-square" alt="Open Plugin Market" /></a>
    <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="Awesome DSH Plugin" /></a>
  </p>

  <table>
    <tr>
      <td align="center"><strong>58</strong><br /><sub>pstack skills</sub></td>
      <td align="center"><strong>22</strong><br /><sub>playbooks</sub></td>
      <td align="center"><strong>4</strong><br /><sub>plugin tools</sub></td>
      <td align="center"><strong>3</strong><br /><sub>agent presets</sub></td>
    </tr>
  </table>

  <p>
    <a href="#quick-start">🚀 Quick start</a> ·
    <a href="#️-common-commands">⌨️ Commands</a> ·
    <a href="#-capabilities">🧩 Capabilities</a> ·
    <a href="#-optional-dsh-plugins">🔌 Optional plugins</a> ·
    <a href="#-port-verification">🧪 Port verification</a> ·
    <a href="#️-remaining-gaps">⚠️ Limitations</a> ·
    <a href="#-faq">❓ FAQ</a> ·
    <a href="#-compatibility">📦 Compatibility</a>
  </p>
</div>

---

`dsh-pstack` ports [pstack](https://github.com/cursor/plugins/tree/main/pstack) to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). It ships the upstream skills, playbooks, and references, then adds the DSH adapter for skill names, a model route for each role, subagents that accept an explicit route, and tools to list the available models and roles and interrupt a subagent.

The [runtime mapping](./port/dsh.md) maps each Cursor feature to DeepSeek Harness. Real DSH Web sessions test the port, and [Port verification](#-port-verification) explains how.

> [!IMPORTANT]
> Requires DSH `>=0.2.2-rc.2` and Node.js `>=24.21.1`. See each script's help for the runtime it needs.

<a id="quick-start"></a>

## 🚀 Quick start

1. **Install the plugin.**

   ```sh
   dsh plugin --profile web add dsh-pstack
   ```

   You can also install it from the **Plugins** page in Web or Desktop.

2. **Restart the profile or open a new Session.**

## 🧭 Usage

Pick either path and expand it for the full steps.

<details>
<summary><strong>🖥️ Visual setup</strong></summary>

Use the plugin UI to set workflow defaults, enable related plugins, and route each role.

1. Open **Plugins → Installed plugins**, select **pstack**, then click **Configure**.

   ![Configure entry](./assets/plugin-configure.png)

2. On the **General** tab, choose whether new Sessions start with the Poteto workflow and with Agent Teams collaboration.

   ![General settings](./assets/plugin-general.png)

3. In **Recommended plugins**, review the **Recommended** and **Optional** groups. **Enable all** only enables plugins in the **Recommended** group.

   ![Recommended plugins](./assets/plugin-recommended.png)

4. Open **Role models**, set the provider, model, and reasoning effort for each role, then save the changed row or use **Save all**.

   ![Role models](./assets/plugin-roles.png)

5. In a Session, open the model and reasoning menu. Turn on **Poteto workflow** and **Use Agent Teams** independently. Both work under any preset.

   ![Session workflow switches](./assets/session-workflow-switches.png)

</details>

<details>
<summary><strong>🧠 Skill usage</strong></summary>

Use pstack skills to start workflows directly from a Session.

1. **Initialize role routes.** Run `/setup-pstack` once. It writes the detected routes to `$DSH_HOME/pstack-models.json`. Without this file, roles inherit the parent route. If an older `$DSH_HOME/pstack-models.mdc` exists, the plugin migrates it to JSON on first read and removes the old file.
2. **Start through skills.** Type `/poteto-mode` directly. You do not need to switch presets first.
3. **Use targeted commands.** Pick a command from [Common commands](#️-common-commands).

</details>

## ⌨️ Common commands

| Task | Commands |
|---|---|
| Help | `/poteto-help` |
| Plan and build | `/poteto-mode`, `/architect`, `/arena`, `/swarm` |
| Understand and investigate | `/how`, `/why`, `/teach` |
| Verify | `/create-verification-skill`, `/statechart` |
| Review and maintain | `/show-me-your-work`, `/retro`, `/docs-drift` |

## 🧩 Capabilities

### 🛠️ Plugin tools

| Tool | Function |
|---|---|
| `pstack_subagent` | Starts one subagent with an `agent_preset`, optionally overriding its route with provider, model, and reasoning_effort. |
| `pstack_interrupt` | Stops a pstack child's current turn by its name from `list_agents` or its Session id. Built-in presets disable the native `interrupt_agent`, so this is the interruption path. |
| `pstack_models` | Lists the providers, models, and reasoning efforts this deployment serves. |
| `pstack_roles` | Reports each role's configured routes as provider, model, and reasoningEffort values, with each route's served efforts and default. |

### 🎛️ Workflow switches

The Poteto workflow and Agent Teams collaboration are independent switches, and you can turn on both in one Session. They work under any preset.

- **Poteto workflow** keeps the poteto-mode rules in the system prompt on every turn.
- **Use Agent Teams** makes `pstack_subagent` start a teammate, so pstack delegation can track shared work on the Team board.

Set a switch for the current Session in the model and reasoning menu. Set the defaults for new Sessions on the **General** tab of the Pstack configuration dialog, using **Default for new sessions** and **Default Agent Teams for new sessions**.

<details>
<summary><strong>⌨️ Toggle with a keyboard shortcut</strong></summary>

To flip the Poteto workflow switch from the keyboard, set a shortcut in **Settings → General → Shortcuts** under **Toggle Poteto workflow**. The shortcut toggles the switch for the current Session.

![Toggle Poteto workflow shortcut](./assets/shortcut-toggle-poteto.png)

</details>

### 🎭 Agent presets

The package ships three child presets for delegation.

| Preset | Scope | Use |
|---|---|---|
| `poteto-agent` | Child | Handles implementation delegation with the pstack persona and `poteto-mode` instructions. |
| `comment-sicko` | Child | Handles read-only comment review and reports deletion targets and `MUST KILL` symbols. |
| `readonly` | Child | Provides a sandbox-enforced read-only researcher for inspection and evidence gathering. |

### 📚 Additional skills

These skills extend pstack with authoring, project-maintenance, and evidence-gathering workflows.

| Skill | Source | Use it to |
|---|---|---|
| `writing-for-agents` | `vendored` | Write or review a skill, `AGENTS.md`, `CLAUDE.md`, or another agent-facing document, including the `create-skill` use case. |
| `retro` | `vendored` | Review a coding session's environment for improvements to navigation, checks, conventions, tools, and information access. |
| `deslop` | `vendored` | Clean unnecessary comments, defensive code, casts, and nesting from a diff without changing behavior. |
| `control-ui` | `vendored` | Drive a local Web, IDE, or Electron interface and capture visual or accessibility evidence. |
| `control-cli` | `vendored` | Drive an interactive CLI or TUI and capture terminal transcripts or performance evidence. |
| `decision-write` | `authored` | Record a design choice, its rationale, and its implementation evidence through a traceable lifecycle. |
| `decision-audit` | `authored` | Check decision-record status, scope, implementation anchors, and supersession as design history grows. |
| `setup-project-docs` | `authored` | Establish architecture, glossary, decision conventions, and pointers for a project's documentation. |
| `docs-drift` | `authored` | Audit maintained documentation and repair approved drift, redundancy, and unsupported claims. |

[`skills/skills-lock.json`](./skills/skills-lock.json) records the sources and hashes of vendored skills.

## 🔌 Optional DSH plugins

Install dsh-pstack without these plugins, then enable only the capabilities you need.

| Use case | Plugin | What it provides and its boundaries |
|---|---|---|
| Worktrees and GitHub PRs | `@deepseek-ai/dsh-experimental-forge-bundle` | Local worktrees and GitHub PR workflows. GitHub status requires a logged-in `gh`. Without this plugin, use `gh` and `git worktree add` through `bash`. |
| Session history | `@deepseek-ai/dsh-experimental-session-search` | Read-only history and event inspection. It matches Sessions by exact `cwd`. Whether it includes subagent transcripts is unconfirmed. |
| Desktop verification | `@deepseek-ai/dsh-cua-bundle` | macOS desktop control in PTC desktop-control sessions. Windows support is incomplete. |
| Persistent terminals | `@deepseek-ai/dsh-experimental-terminal-bundle` | Persistent shell and REPL sessions for CLI and TUI verification. |
| Autonomous loops | `@deepseek-ai/dsh-experimental-ralph-bundle` | A foreground loop that starts a fresh child each round, rather than a persistent Session loop or event watcher. |

Enable packages through **Plugins → Add plugin**, then restart the profile when required. All listed packages ship with DSH as optional bundles. `@deepseek-ai/dsh-cua-bundle` runs on macOS only.

Steps that depend on a disabled plugin report skipped or blocked, never passed. See the [DSH adaptation guide](./port/dsh.md) for setup and fallbacks.

## 🧪 Port verification

Real DeepSeek Harness Web sessions test the port. They do not compare text with upstream. [playground/docs/workflow.md](./playground/docs/workflow.md) documents the full procedure.

- **Native baseline.** The generator copies upstream pstack into `playground/fixtures/native/pstack` and installs nothing else. `playground/fixtures/native/dsh.md` states each upstream capability as one of three cases: native in DSH, provided only by an official optional plugin, or absent. The generator copies that document and rewrites link references only, so the upstream wording stays intact.
- **Capability-driven runs.** Coverage comes from `playground/scenarios/native-gaps.json` and the scenario files under `playground/scenarios/probes/`; the gap list records what the DSH standard runtime lacks, and the scenarios verify those gaps.
- **Semantic review.** A skill that loads only proves it was reachable. Each scenario records a separate verdict (`supported`, `gap`, or `inconclusive`) with a reviewer and a reason. The adapted run records `verified`, `not-verified`, or `inconclusive`.
- **Adapted re-check.** Review findings drive [port/dsh.md](./port/dsh.md). Rebuild the adapted package with `vp run build`, then rerun the same scenarios to confirm the mapped behavior.
- **Environment matrix.** Capability probes run in `base` by default. `render` is the rendering comparison environment. `agent-team` is the Team-on environment that verifies pstack delegation with Agent Teams enabled.

## ⚠️ Remaining gaps

These limits remain even with every optional plugin that can run alongside pstack enabled.

| Area | Limitation |
|---|---|
| Cursor platform services | No Automations, Cursor webhooks, `SendToUser`, cloud agents, or persistent cloud Projects. |
| Bugbot | Cannot start, configure, or wait for Bugbot. You can still handle existing Bugbot comments as PR reviews. |
| PR orchestration | No model-side change-request tool or shared PR tracking board and ledger. `watch-pr` still provides stack verdicts. |
| Event-driven loops | No forge event subscription. Local goals, schedules, and watchers are not equivalent. |
| Diagram rendering | No built-in renderer. Charts return Mermaid text. Render an image with your own tools when needed. |
| Media evidence | No built-in video rendering, recording, or frame-level verification. A project-owned renderer works when it produces a checkable file. Otherwise use external recording or FFmpeg. |
| Desktop coverage | Computer use is limited to macOS PTC desktop-control sessions. Windows support is incomplete. |
| MCP discovery | No automatic evidence-category discovery. Configure and identify MCP tools explicitly. |

## ❓ FAQ

<details>
<summary><strong>Expand for questions and answers</strong></summary>

1. **Preset names show in English**

   Set the language to Chinese in **Settings → General → Language**, then restart DSH. The row may already show Chinese because it follows the browser. Select Chinese again. That saves the preference that preset names use when the host starts.

2. **Some rendering needs a plugin**

   Native DSH renders images and SVG inline. A Mermaid diagram returns as text, and audio or video shows as a file card. That is expected degradation, not a broken skill. For the full experience, you can install a plugin that enhances native rendering, for example `@changfenhuang/dsh-genui`.

</details>

## 📦 Compatibility

Choose a release by its declared DSH range. Each range has its own table of releases and the pstack version each bundles.

**DSH `>=0.2.2-rc.2`**

| dsh-pstack release | pstack version |
|---|---|
| `0.5.0` | `0.15.43` |

**DSH `>=0.2.2-rc.1`**

| dsh-pstack release | pstack version |
|---|---|
| `0.4.1` | `0.15.36` |
| `0.3.1` | `0.15.36` |

**DSH `>=0.2.1-rc.5`**

| dsh-pstack release | pstack version |
|---|---|
| `0.2.2` | `0.15.36` |

See [Porting](./port/AGENTS.md#生成与发布) for how the compatibility table is maintained. Older DSH baselines move to [compatibility history](./docs/compatibility-history.md).

## 🔗 Friendly links

- [LinuxDo - 新的理想型社区](https://linux.do/)

## 💛 Credits

- [pstack](https://github.com/cursor/plugins/tree/main/pstack), designed and open-sourced by Lauren Tan and the Cursor team. It is the foundation of this port.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), developed by the DeepSeek team. It is the host platform for this plugin.
- [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit), the source of the vendored `deslop`, `control-ui`, and `control-cli` skills.
- [mattpocock/skills](https://github.com/mattpocock/skills), the source of the vendored `writing-for-agents` and `retro` skills.

This project is a community port, not an official Cursor or DeepSeek release.

## 📄 License

Original dsh-pstack code and documentation use the [MIT license](./LICENSE) © [leiwang](https://github.com/l246804). Bundled upstream projects and vendored skills use their upstream licenses. See [Credits](#-credits).
