/**
 * Guards the preset persona prefixes against the pinned upstream agent
 * prompts. The prefixes in `cordis.patch.yml` are hand-adapted copies, so an
 * upstream bump that edits an agent body must either update the prefix or the
 * declared adaptation below.
 */

import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

const PATCH = readFileSync("cordis.patch.yml", "utf8");

const AGENTS = "native/pstack/agents";

/** Cursor-only fallback that DSH replaces with the absolute skill path in the brief. */
const CURSOR_PATH_HUNT =
  " With no path, before any other work, search `~/.cursor/plugins/` for a file whose path ends in `skills/poteto-mode/SKILL.md`. If more than one file matches, use the copy whose `.cursor-plugin/plugin.json` has the highest `version`.";

/** Cursor-only failure line that follows the skill-catalog sentence. */
const CURSOR_PATH_FAILURE = " If no such file exists, stop and tell your parent.";

/** Declared adaptations from the pinned body to the DSH persona. */
const ADAPTATIONS: Record<string, (body: string) => string> = {
  "poteto-agent": (body) =>
    body
      .replace("every Task spawn", "every delegation")
      .replace(CURSOR_PATH_HUNT, "")
      .replace(CURSOR_PATH_FAILURE, ""),
  "comment-sicko": (body) =>
    body.replace(
      "I trace the named symbol or call, run `/why` from the **why** skill on it, or both.",
      "I trace the named symbol or call, read the commits behind it, or both.",
    ),
};

const GUARDED = Object.keys(ADAPTATIONS).sort();

/** One preset row's lines, from its id through the next preset row. */
function presetBlock(id: string): string[] {
  const lines = PATCH.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `    - id: preset-${id}`);
  if (start < 0) throw new Error(`preset ${id} not found`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("    - id: "));
  return lines.slice(start, end < 0 ? undefined : end);
}

/** The block-scalar persona prefix text from one preset row. */
function personaPrefix(id: string): string {
  const block = presetBlock(id);
  const start = block.findIndex((line) => line.startsWith("              prefix: |"));
  if (start < 0) throw new Error(`preset ${id} has no block persona prefix`);
  const lines: string[] = [];
  for (const line of block.slice(start + 1)) {
    if (line.trim() === "") {
      lines.push("");
      continue;
    }
    if (!line.startsWith("                ")) break;
    lines.push(line.slice(16));
  }
  return lines.join("\n").trim();
}

/** One agent prompt without its frontmatter and H1. */
function upstreamBody(id: string): string {
  return readFileSync(`${AGENTS}/${id}.md`, "utf8")
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim()
    .replace(/^# .*\n+/, "")
    .trim();
}

describe("preset persona upstream drift", () => {
  it("accounts for every bundled agent prompt", () => {
    const bundled = readdirSync(AGENTS)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -".md".length))
      .sort();
    expect(bundled).toEqual(GUARDED);
  });

  for (const id of GUARDED) {
    it(`keeps the ${id} persona in sync with its upstream body`, () => {
      const adapted = ADAPTATIONS[id]!(upstreamBody(id));
      expect(personaPrefix(id)).toBe(adapted);
    });
  }
});
