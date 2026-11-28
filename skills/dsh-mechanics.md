## DeepSeek Harness invocation

For DSH, use these runtime rules when applying the invocation discussion below. `disable-model-invocation: true` hides a skill from the model's `skill` catalog; it does not prevent reading its `SKILL.md` as a file. A user `/name` gesture injects the skill directly. A workflow can follow a known skill file when authorized to do so, even if catalog lookup cannot find it. Use the skill's resource base to resolve references.

Choose discovery policy for the intended host. Description visibility and automatic loading are host behavior, not a permission boundary. Keep shared references linked from the instructions that need them.
