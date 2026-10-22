/**
 * Regenerate the DSH-facing copies of the upstream pstack skills.
 *
 * `assets/skills/` is generated, never hand-edited. Run `vp run sync` after
 * moving the `upstream/cursor-plugins` submodule, review the diff, and commit
 * both the submodule pointer and the regenerated tree together.
 *
 * `--check` exits non-zero when the checked-in tree differs from a fresh
 * conversion. CI uses it to prove the port never drifts from its source.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DSH_ADAPTER_NOTE,
  DSH_AGENTS,
  DSH_HARNESS_DOC,
  DSH_SETUP_SKILL,
  EXCLUDED_SKILLS,
  parseFrontmatter,
  rewriteCommon,
  rewriteSkill,
  serializeSkill,
} from "./adapt.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = join(ROOT, "upstream/cursor-plugins/pstack");
const OUT_SKILLS = join(ROOT, "assets/skills");
const OUT_AGENTS = join(ROOT, "assets/agents");
const OUT_DOCS = join(ROOT, "assets/docs");
const check = process.argv.includes("--check");

interface GeneratedFile {
  path: string;
  content: string;
  mode?: number;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else files.push(full);
  }
  return files;
}

async function readUpstream(relativePath: string): Promise<string> {
  return readFile(join(UPSTREAM, relativePath), "utf8");
}

async function buildSkills(): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const skillDirectories = (await readdir(join(UPSTREAM, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directory of skillDirectories) {
    if (EXCLUDED_SKILLS.has(directory)) continue;
    const sourcePath = `skills/${directory}/SKILL.md`;
    const raw = await readUpstream(sourcePath);
    const { data, body } = parseFrontmatter(raw);

    if (!data.name || !data.description) {
      throw new Error(`${sourcePath}: missing name or description frontmatter`);
    }
    if (data.name !== directory) {
      throw new Error(
        `${sourcePath}: frontmatter name "${data.name}" does not match its directory`,
      );
    }

    const converted =
      directory === "setup-pstack"
        ? DSH_SETUP_SKILL
        : serializeSkill(
            {
              name: data.name,
              description: data.description,
              modelInvocable: data["disable-model-invocation"] !== "true",
              userInvocable: data["user-invocable"] !== "false",
              ...(data.whenToUse ? { whenToUse: data.whenToUse } : {}),
            },
            rewriteSkill(sourcePath, body),
            DSH_ADAPTER_NOTE,
          );

    files.push({ path: `assets/skills/${directory}/SKILL.md`, content: converted });

    for (const file of await listFiles(join(UPSTREAM, "skills", directory))) {
      const relativePath = relative(join(UPSTREAM, "skills", directory), file);
      if (relativePath === "SKILL.md") continue;
      const target = `assets/skills/${directory}/${relativePath}`;
      if (relativePath.endsWith(".md")) {
        const text = await readFile(file, "utf8");
        files.push({
          path: target,
          content: rewriteSkill(`skills/${directory}/${relativePath}`, text),
        });
        continue;
      }
      const bytes = await readFile(file);
      const info = await stat(file);
      files.push({ path: target, content: bytes.toString("base64"), mode: info.mode & 0o777 });
    }
  }

  return files;
}

function buildAgents(): GeneratedFile[] {
  return Object.entries(DSH_AGENTS).map(([name, content]) => ({
    path: `assets/agents/${name}.md`,
    content,
  }));
}

async function buildDocs(): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [
    { path: "assets/docs/harness/dsh.md", content: DSH_HARNESS_DOC },
    { path: "assets/docs/pstack-models.example.md", content: buildModelExample() },
  ];

  const guideRoot = join(UPSTREAM, "docs/guide");
  for (const file of await listFiles(guideRoot)) {
    const relativePath = relative(guideRoot, file);
    if (relativePath.endsWith(".jpg") || relativePath.endsWith(".png")) continue;
    const text = await readFile(file, "utf8");
    files.push({
      path: `assets/docs/guide/${relativePath}`,
      content: rewriteSkill(`docs/guide/${relativePath}`, text),
    });
  }

  for (const file of await listFiles(join(UPSTREAM, "automations"))) {
    const relativePath = relative(UPSTREAM, file);
    if (!relativePath.endsWith(".md")) continue;
    const text = await readFile(file, "utf8");
    files.push({ path: `assets/cursor-only/${relativePath}`, content: rewriteCommon(text) });
  }

  return files;
}

function buildModelExample(): string {
  return `# ~/.dsh/pstack-models.md
#
# One line per role. Delete a line to inherit the parent chat's route.
# Value: inherit-parent | <provider>/<model> [effort]
# Discover routes with the list_subagent_models tool.
# budget: large (xhigh)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent, inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent
`;
}

async function existingGeneratedFiles(): Promise<string[]> {
  const roots = [OUT_SKILLS, OUT_AGENTS, OUT_DOCS];
  const files: string[] = [];
  for (const root of roots) {
    try {
      for (const file of await listFiles(root)) files.push(relative(ROOT, file));
    } catch {
      // A missing root means nothing was generated yet.
    }
  }
  return files.sort();
}

async function writeGenerated(files: GeneratedFile[]): Promise<void> {
  await rm(OUT_SKILLS, { recursive: true, force: true });
  await rm(OUT_AGENTS, { recursive: true, force: true });
  await rm(OUT_DOCS, { recursive: true, force: true });

  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    const target = join(ROOT, file.path);
    await mkdir(dirname(target), { recursive: true });
    if (file.mode === undefined) {
      await writeFile(target, file.content, "utf8");
      continue;
    }
    await writeFile(target, Buffer.from(file.content, "base64"), { mode: file.mode });
  }
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

async function checkGenerated(files: GeneratedFile[]): Promise<string[]> {
  const mismatches: string[] = [];
  const expected = new Map(files.map((file) => [file.path, file]));
  const existing = await existingGeneratedFiles();

  for (const path of existing) {
    if (!expected.has(path)) mismatches.push(`extra: ${path}`);
  }

  for (const [path, file] of expected) {
    try {
      const current = await readFile(join(ROOT, path));
      if (file.mode !== undefined) {
        if (!current.equals(Buffer.from(file.content, "base64")))
          mismatches.push(`changed: ${path}`);
        continue;
      }
      if (normalize(current.toString("utf8")) !== normalize(file.content)) {
        mismatches.push(`changed: ${path}`);
      }
    } catch {
      mismatches.push(`missing: ${path}`);
    }
  }

  return mismatches;
}

async function main(): Promise<void> {
  const files = [...(await buildSkills()), ...buildAgents(), ...(await buildDocs())];

  if (check) {
    const mismatches = await checkGenerated(files);
    if (mismatches.length > 0) {
      console.error("Generated pstack tree is stale. Run `vp run sync` and commit the result.");
      for (const line of mismatches.slice(0, 40)) console.error(`  ${line}`);
      if (mismatches.length > 40) console.error(`  ... and ${mismatches.length - 40} more`);
      process.exit(1);
    }
    console.log(`pstack tree is in sync (${files.length} files).`);
    return;
  }

  await writeGenerated(files);
  const skillCount = files.filter((file) => file.path.endsWith("/SKILL.md")).length;
  console.log(
    `Generated ${files.length} files (${skillCount} skills) from upstream/cursor-plugins/pstack.`,
  );
}

await main();
