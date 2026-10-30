#!/usr/bin/env node
/**
 * `check-harness-doc`: keep `pstack/harness/docs/harness/dsh.md` honest.
 *
 * The DSH adapter is written from the upstream `claude-code.md` template, so anything the
 * template does not carry has to be added on purpose. That is exactly how a row can go
 * missing: a doc rewrite re-mirrors the template and silently drops the local
 * replacements. This checker makes the missing cases mechanical:
 *
 *   C1  rows in `docs/harness-doc.yaml` appear in dsh.md, with their replacement or skip
 *   C2  no upstream row disappeared; extras are only the manifest-declared ones
 *   C3  `OPT-*` ids and package names match `pstack/README.md`
 *   C4  every `AUT-*`/`EXCL-*` in README is claimed by a manifest row
 *   C5  the eight sections exist in the manifest order
 *   C6  every `dsh.md <Section>` citation in README names a real section
 *   C7  forbidden stale names are absent
 *   C8  documented subagent arguments and script ids still exist in `src/`
 *
 * Read-only: it reports problems and exits 1; the doc owner edits `dsh.md` by hand and
 * reruns. It never writes the adapter, because a mechanical row such as
 * `| create-skill | writing-for-agents |` would pass the gate while leaving the runtime
 * reader without an instruction.
 *
 * Exit 0 when clean, 1 when any problem is reported.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { load } from "js-yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, "..", "..");

const DSH_DOC = "pstack/harness/docs/harness/dsh.md";
const TEMPLATE = "upstream/cursor-plugins/pstack/docs/harness/claude-code.md";
const README = "pstack/README.md";
const MANIFEST = "docs/harness-doc.yaml";
const SKILLS = "pstack/pstack/skills";
const SUBAGENT_SRC = "src/subagent.ts";
const SCRIPT_SRC = "src/internal/script-registry.ts";

/** Sections this repo adds beyond the upstream template. */
const EXTRA_SECTIONS = new Set(["Local replacements", "Optional plugins"]);

function read(root, path) {
  const full = join(root, path);
  if (!existsSync(full)) return undefined;
  return readFileSync(full, "utf8");
}

/** Split Markdown on `## ` headings. Returns name -> body lines, plus order. */
export function splitSections(text) {
  const bodies = new Map();
  const order = [];
  let current;
  for (const line of text.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      bodies.set(current, []);
      order.push(current);
      continue;
    }
    if (current !== undefined) bodies.get(current).push(line);
  }
  return { bodies, order };
}

/** First cells of the table rows inside one section body. */
function tableRowCells(body) {
  const cells = [];
  for (const line of body) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
    const first = trimmed.split("|")[1]?.trim() ?? "";
    if (first === "Cursor" || first === "ID" || first === "能力 ID" || first === "类型") continue;
    cells.push(first);
  }
  return cells;
}

/** The table lines in one section body, kept whole for row matches. */
function tableLines(body) {
  return body.filter((line) => line.trim().startsWith("|") && !/^\|[\s\-:|]+\|$/.test(line.trim()));
}

function sliceBetween(text, startRe, endRe) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => startRe.test(line));
  if (start === -1) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (endRe.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function packages(cell) {
  return [...cell.matchAll(/`(@[A-Za-z0-9@/._-]+)`/g)].map((match) => match[1]);
}

/** All Markdown files under a directory, recursively. */
function walkMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walkMarkdown(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== "object") throw new Error(`${MANIFEST}: empty manifest`);
  if (raw.schema !== 1) throw new Error(`${MANIFEST}: expected schema: 1`);
  for (const key of ["sections", "builtins", "rows"]) {
    if (!Array.isArray(raw[key])) throw new Error(`${MANIFEST}: "${key}" must be an array`);
  }
  if (!Array.isArray(raw.forbidden)) throw new Error(`${MANIFEST}: "forbidden" must be an array`);
  return raw;
}

/**
 * Run every check. `root` holds the documents, `repoRoot` holds the source facts
 * (defaults to `root`, so a fixture can borrow the real `src/` and skills).
 */
export function checkHarnessDoc({ root = DEFAULT_ROOT, repoRoot = root } = {}) {
  const problems = [];
  const add = (message) => problems.push(message);

  const manifestText = read(root, MANIFEST);
  if (manifestText === undefined) return [`${MANIFEST}: missing`];
  let manifest;
  try {
    manifest = normalizeManifest(load(manifestText));
  } catch (error) {
    return [error.message];
  }

  const docText = read(root, DSH_DOC);
  if (docText === undefined) return [`${DSH_DOC}: missing`];
  const { bodies, order } = splitSections(docText);

  // C5 — sections present, in manifest order.
  for (const name of manifest.sections) {
    if (!bodies.has(name)) add(`C5 ${DSH_DOC}: missing section "## ${name}"`);
  }
  const knownOrder = order.filter((name) => manifest.sections.includes(name));
  if (knownOrder.join("|") !== manifest.sections.filter((name) => order.includes(name)).join("|")) {
    add(
      `C5 ${DSH_DOC}: section order is ${knownOrder.join(" → ")}, expected ${manifest.sections.join(" → ")}`,
    );
  }

  // C1 — manifest rows are present with their replacement or skip.
  for (const row of manifest.rows) {
    const body = bodies.get(row.target);
    if (body === undefined) {
      add(`C1 ${row.id}: target section "## ${row.target}" does not exist`);
      continue;
    }
    const matches = tableLines(body).filter((line) => line.includes(row.cursor));
    if (matches.length === 0) {
      add(
        `C1 ${row.id}: "## ${row.target}" has no row for ${JSON.stringify(row.cursor)}; add one (source: ${row.source ?? MANIFEST}, expected replacement: ${JSON.stringify(row.replacement ?? "skip line")})`,
      );
      continue;
    }
    if (row.replacement !== undefined && !matches.some((line) => line.includes(row.replacement))) {
      add(
        `C1 ${row.id}: the ${JSON.stringify(row.cursor)} row lacks ${JSON.stringify(row.replacement)}`,
      );
    }
    if (row.skip === true && !matches.some((line) => /Skip(ped)?\b/.test(line))) {
      add(`C1 ${row.id}: the ${JSON.stringify(row.cursor)} row lacks a skip instruction`);
    }
    for (const capability of row.capability ?? []) {
      const readme = read(root, README) ?? "";
      if (!readme.includes(capability))
        add(`C1 ${row.id}: capability ${capability} does not appear in ${README}`);
    }
  }

  // C2 — the upstream template's rows survive; extras are declared in the manifest.
  const templateText = read(root, TEMPLATE);
  if (templateText === undefined) {
    add(`C2 ${TEMPLATE}: missing`);
  } else {
    const template = splitSections(templateText);
    for (const [name, body] of template.bodies) {
      if (!bodies.has(name)) {
        add(`C2 ${DSH_DOC}: dropped upstream section "## ${name}"`);
        continue;
      }
      const want = tableRowCells(body);
      const have = tableRowCells(bodies.get(name));
      for (const cell of want) {
        if (!have.includes(cell))
          add(`C2 ${DSH_DOC}: "## ${name}" lost the upstream row ${JSON.stringify(cell)}`);
      }
      for (const cell of have) {
        if (want.includes(cell)) continue;
        const declared = manifest.rows.some(
          (row) => row.target === name && (cell.includes(row.cursor) || row.cursor.includes(cell)),
        );
        if (!declared)
          add(`C2 ${DSH_DOC}: "## ${name}" has an undeclared extra row ${JSON.stringify(cell)}`);
      }
    }
    for (const name of order) {
      if (template.bodies.has(name) || EXTRA_SECTIONS.has(name)) continue;
      add(`C2 ${DSH_DOC}: "## ${name}" is not in the upstream template`);
    }
  }

  // C3 — OPT ids and packages agree with README.
  const readmeText = read(root, README);
  if (readmeText === undefined) {
    add(`C3 ${README}: missing`);
  } else {
    const readmeOpts = new Map();
    const section = sliceBetween(readmeText, /^### 3\.3\b/, /^### |^## /);
    for (const line of section.split("\n")) {
      const match = /^\|\s*(OPT-\d+)\s*\|(.*)$/.exec(line);
      if (match) readmeOpts.set(match[1], packages(match[2]));
    }
    const dshOpts = new Map();
    for (const line of tableLines(bodies.get("Optional plugins") ?? [])) {
      const match = /^\|\s*(OPT-\d+)\s*\|(.*)$/.exec(line.trim());
      if (match) dshOpts.set(match[1], packages(match[2]));
    }
    for (const [id, want] of readmeOpts) {
      if (!dshOpts.has(id)) {
        add(`C3 ${DSH_DOC}: "## Optional plugins" is missing ${id}`);
        continue;
      }
      const have = dshOpts.get(id);
      for (const name of want) {
        if (!have.includes(name)) add(`C3 ${id}: ${name} is in README but not in ${DSH_DOC}`);
      }
      for (const name of have) {
        if (!want.includes(name)) add(`C3 ${id}: ${name} is in ${DSH_DOC} but not in README`);
      }
    }
    for (const id of dshOpts.keys()) {
      if (!readmeOpts.has(id)) add(`C3 ${DSH_DOC}: ${id} has no README entry`);
    }
  }

  // C4 — every platform exclusion in README is claimed by a manifest row.
  if (readmeText !== undefined) {
    const claimed = new Set(manifest.rows.flatMap((row) => row.capability ?? []));
    const section = sliceBetween(readmeText, /^## 4\./, /^## 5\./);
    for (const line of section.split("\n")) {
      const match = /^\|\s*((?:AUT|EXCL)-\d+)\s*\|/.exec(line);
      if (match && !claimed.has(match[1]))
        add(`C4 ${match[1]} is a README platform exclusion with no ${MANIFEST} row`);
    }
  }

  // C6 — README citations of dsh.md sections resolve.
  if (readmeText !== undefined) {
    for (const match of readmeText.matchAll(/dsh\.md\s+([A-Za-z][A-Za-z0-9 -]{1,40})/g)) {
      const cited = match[1].trim();
      const optionRow = /^(OPT-\d+)$/.exec(cited);
      const hit = manifest.sections.some((name) => cited === name || cited.startsWith(`${name} `));
      if (optionRow !== null) {
        if (!docText.includes(optionRow[1]))
          add(`C6 ${README}: cites ${optionRow[1]}, which is not in ${DSH_DOC}`);
        continue;
      }
      if (!hit) add(`C6 ${README}: cites "dsh.md ${cited}", which is not a dsh.md section`);
    }
  }

  // C7 — stale names.
  for (const literal of manifest.forbidden) {
    if (docText.includes(literal))
      add(`C7 ${DSH_DOC}: contains forbidden text ${JSON.stringify(literal)}`);
  }

  // C8 — documented facts still exist in source.
  const subagent = read(repoRoot, SUBAGENT_SRC);
  if (subagent !== undefined) {
    const block = /const known = \[([\s\S]*?)\] as const;/.exec(subagent);
    if (block === null) {
      add(`C8 ${SUBAGENT_SRC}: cannot find the argument list`);
    } else {
      for (const [, argument] of block[1].matchAll(/"([A-Za-z]+)"/g)) {
        if (!docText.includes(argument))
          add(`C8 ${DSH_DOC}: does not mention subagent argument ${JSON.stringify(argument)}`);
      }
    }
  }
  const scripts = read(repoRoot, SCRIPT_SRC);
  if (scripts !== undefined) {
    for (const [, id] of scripts.matchAll(/id:\s*"([^"]+)"/g)) {
      if (!docText.includes(id))
        add(`C8 ${DSH_DOC}: does not mention script id ${JSON.stringify(id)}`);
    }
  }

  // Builtins referenced by a shipped skill must have a manifest row.
  const skillText = walkMarkdown(join(repoRoot, SKILLS))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  if (skillText !== "") {
    for (const name of manifest.builtins) {
      if (!skillText.includes(name)) continue;
      const declared = manifest.rows.some(
        (row) => row.target === "Local replacements" && row.cursor.includes(name),
      );
      if (!declared)
        add(
          `C1 ${name} appears in a shipped skill but has no Local replacements row in ${MANIFEST}`,
        );
    }
  }

  return problems;
}

function main(argv) {
  const rootIndex = argv.indexOf("--root");
  const root = rootIndex === -1 ? DEFAULT_ROOT : resolve(argv[rootIndex + 1]);
  const repoIndex = argv.indexOf("--repo-root");
  const repoRoot = repoIndex === -1 ? root : resolve(argv[repoIndex + 1]);

  const problems = checkHarnessDoc({ root, repoRoot });
  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length > 0) {
    console.log(
      `${problems.length} problem(s). Edit ${DSH_DOC} by hand; ${MANIFEST} names the expected row.`,
    );
    return 1;
  }
  console.log("harness doc is consistent with README, the upstream template, and src.");
  return 0;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exit(main(process.argv.slice(2)));
}
