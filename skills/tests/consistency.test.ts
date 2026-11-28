import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { skillConsistencyProblems, skillHash } from "../scripts/lib/consistency.ts";

mkdirSync(".tmp", { recursive: true });
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(): string {
  const root = mkdtempSync(join(".tmp", "skills-check-"));
  roots.push(root);
  const write = (path: string, text: string): void => {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  };
  for (const dir of [
    ".agents/skills/local",
    "skills/authored/local",
    "skills/.agents/skills/upstream",
  ])
    write(`${dir}/SKILL.md`, "# Skill\n");
  write("package.json", '{"skills":[]}');
  write(
    "skills/package.json",
    '{"skills":[{"source":"owner/repo/subdir","ref":"abc","skills":["upstream"]}]}',
  );
  write(
    "skills-lock.json",
    JSON.stringify({
      skills: {
        local: {
          source: "./skills/authored",
          computedHash: skillHash(join(root, ".agents/skills/local")),
        },
      },
    }),
  );
  write(
    "skills/skills-lock.json",
    JSON.stringify({
      skills: {
        upstream: {
          source: "owner/repo",
          ref: "abc",
          computedHash: skillHash(join(root, "skills/.agents/skills/upstream")),
        },
      },
    }),
  );
  return root;
}
describe("skill consistency", () => {
  it("accepts matching copies and detects local drift without network access", () => {
    const root = fixture();
    expect(skillConsistencyProblems(root)).toEqual([]);
    writeFileSync(join(root, "skills/.agents/skills/upstream/SKILL.md"), "Changed");
    writeFileSync(join(root, "skills/authored/local/SKILL.md"), "New authored content");
    expect(skillConsistencyProblems(root)).toEqual([
      "skills: upstream differs from its lock hash",
      "authored local: synchronize the root installation",
    ]);
  });
  it("rejects stale source pins and extra vendored directories", () => {
    const root = fixture();
    const path = join(root, "skills/package.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("abc", "def"));
    mkdirSync(join(root, "skills/.agents/skills/extra"));
    expect(skillConsistencyProblems(root)).toEqual([
      "skills: upstream does not match the declared source/ref",
      "skills: vendored inventory differs from declarations or lock",
    ]);
  });
});
