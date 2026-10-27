<!-- pstack-overlay: replaces=docs/guide/01-setup.md sha256=384655bdecc713122ca69a485723c58462002a1d512415e94e48597d0dce2fa5 revision=d1453c11d1dde9714d4c313c97d3a68432265c7f -->
# Set up pstack

In this page you install the plugin, pick which models pstack uses, and run your first task. Setup is one command plus a short conversation.

## Install the plugin

In DeepSeek Harness, install the plugin into a profile. `<profile>` is the profile you use, such as `web`:

```text
dsh plugin --profile <profile> add dsh-pstack
```

DeepSeek Harness asks you to restart the session. After the restart the profile has pstack's skills. There is no `/add-plugin` command here.

Each skill attaches to one message. Type `/setup-pstack` on a new task, and the same is true of every other skill in this guide.

## Pick your models

Run:

```text
/setup-pstack
```

[`/setup-pstack`](../../skills/setup-pstack/SKILL.md) detects the models you have access to, asks for a reasoning budget, shows you each role (code delegates, judgment, the review panels), and asks what you want. Answer the questions. It writes `$DSH_HOME/pstack-models.md`, a small file every pstack skill reads.

The defaults run at the highest reasoning each model advertises at or below `xhigh`, the same target as the `large` budget. `unlimited` lifts each model to its highest tier, `max` where the model advertises it. `medium` and `small` lower the reasoning and spend fewer tokens.

You only override what you care about. A role with no line in the file keeps the skill's default. To restore a default, delete that role's line. A rerun of `/setup-pstack` keeps any role whose model differs from the default. When a default changes, a file written before the change still pins the old default, so delete those role lines, or delete the file, then run `/setup-pstack` again.

You might be wondering what happens if you use Auto. Set a role to `inherit-parent` or `auto` and pstack sends no route for that subagent, so it inherits your parent chat model. Both values mean the same thing, and neither is a model slug. For a panel role the value is a list, and one subagent runs per entry, so the list length sets the panel size. Setup also configures `swarm workers`, the default model for every `/swarm` worker unless a race names a model for each arm.

## Accept the verification offers, or don't

At the end of setup, `/setup-pstack` looks for a way to prove app behavior in your project, either a `verify-*` skill or an existing harness. If it finds neither, it offers once to generate one with [`/create-verification-skill`](../../skills/create-verification-skill/SKILL.md).

Say yes and it writes `.dsh/skills/verify-<app>/`, a project-local skill that teaches agents to drive your app the way a user does. It proves the skill works once before handing it over. Say no and setup moves on. You can run `/create-verification-skill` yourself any time. [Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill) covers it in depth.

If you're new to pstack, say yes. An agent that can check its own work keeps going until the check passes. An agent that can't hands every result back to you to check by hand. Of everything in this guide, the verification skill pays off the most.

Then setup offers once to generate a formal verification skill with [`/create-formal-verification-skill`](../../skills/create-formal-verification-skill/SKILL.md), unless the project already has one. Tests check the cases someone thought to write. A formal verification skill checks one key property of your code, such as "a job never runs twice at once", in every case within a stated scope. Say yes when your code has concurrency, retries, a state machine, or a parser, where a bug is costly and tests rarely reach the case that breaks. Otherwise say no, and run it later if that changes. [Verify and ship](./06-verify-and-ship.md#prove-a-property-with-a-formal-verification-skill) covers it.

After setup, start a new chat. The model rule applies to new sessions.

## Keep the cost in check

pstack spends extra tokens on subagents and review panels. That's the price of the rigor. To spend fewer:

- Rerun `/setup-pstack` and pick a smaller reasoning budget or cheaper models. A strong model in the main chat with cheaper, faster models in the code roles is a good split.
- Set a role to `auto` or `inherit-parent` so it runs on the chat's own model.
- Shorten a panel list. Each entry runs one subagent.
- Save `/poteto-mode` for work that needs rigor. A small, obvious edit doesn't.

## Run your first task

Pick something real but small, and describe it the way you'd describe it to a colleague:

```text
/poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

Watch the todo list. Its first items are the matched playbook's steps copied in, the Feature playbook for this prompt. If `/poteto-mode` skips a step, the step stays in the list with `skip: <reason>`, so you can see what it chose not to do.

From here you can type normal follow-ups. A skill attaches to the task that opened it and fades as the task moves on, because DeepSeek Harness has no Custom Mode and no persistent skill selection. Type `/poteto-mode` again on the next task that needs rigor.

Next: [Route work through `/poteto-mode`](./02-poteto-mode.md).
