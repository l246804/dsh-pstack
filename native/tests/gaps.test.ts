import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
type GapFile = { path: string; gaps: string[] };
type GapEntry = { id: string; sources?: string[]; description?: string };

function gapDocument(): { gaps: GapEntry[]; files: GapFile[] } {
  const text = readFileSync(new URL("../gaps.json", import.meta.url), "utf8");
  return JSON.parse(text) as { gaps: GapEntry[]; files: GapFile[] };
}

function walkMarkdown(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return walkMarkdown(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/** Every markdown file under the generated tree, as package-relative paths. */
function treeMarkdown(): string[] {
  const nativeRoot = fileURLToPath(new URL("..", import.meta.url));
  return ["skills", "agents", "docs/guide"]
    .flatMap((dir) => walkMarkdown(join(nativeRoot, "pstack", dir)))
    .map((path) => relative(nativeRoot, path).split(sep).join("/"));
}

/** Answer documents may back a gap's DSH side; they are not upstream skill files. */
const ANSWER_SOURCES = new Set(["dsh.md", "dsh-evidence.md"]);

describe("native gap enumeration", () => {
  const document = gapDocument();
  const gapIds = new Set(document.gaps.map((gap) => gap.id));
  const enumerated = new Set(document.files.map((file) => file.path));

  it("enumerates every markdown file of the generated tree, no more, no less", () => {
    expect([...enumerated].sort()).toEqual(treeMarkdown().sort());
  });

  it("keeps every file gap id inside the gap list", () => {
    const unknown = document.files.flatMap((file) =>
      file.gaps.filter((id) => !gapIds.has(id)).map((id) => `${file.path}:${id}`),
    );
    expect(unknown).toEqual([]);
  });

  it("references every gap from at least one enumerated file", () => {
    const referenced = new Set(document.files.flatMap((file) => file.gaps));
    expect([...gapIds].filter((id) => !referenced.has(id))).toEqual([]);
  });

  it("cites every gap source from the enumerated tree or the answer documents", () => {
    const dangling = document.gaps.flatMap((gap) =>
      (gap.sources ?? [])
        .filter((source) => {
          const path = source.replace(/[#?].*/, "");
          return !enumerated.has(path) && !ANSWER_SOURCES.has(path);
        })
        .map((source) => `${gap.id}:${source}`),
    );
    expect(dangling).toEqual([]);
  });

  it("grounds every gap in at least one enumerated tree file", () => {
    const ungrounded = document.gaps
      .filter((gap) =>
        (gap.sources ?? []).every((source) => !enumerated.has(source.replace(/[#?].*/, ""))),
      )
      .map((gap) => gap.id);
    expect(ungrounded).toEqual([]);
  });
});
