/** Add the DSH invocation clarification to the published upstream reference. */
import { readFileSync, writeFileSync } from "node:fs";

const source = new URL("../.agents/skills/writing-for-agents/SKILL-MECHANICS.md", import.meta.url);
const note = new URL("../dsh-mechanics.md", import.meta.url);
const target = new URL(
  "../../dist/skills/vendored/writing-for-agents/SKILL-MECHANICS.md",
  import.meta.url,
);
const text = readFileSync(source, "utf8");
writeFileSync(target, text.replace(/^(# .*\n)/, `$1\n${readFileSync(note, "utf8")}\n`));
