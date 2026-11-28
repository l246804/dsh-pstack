/** Offline verification of skill sources, installed copies and lock hashes. */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export function skillHash(root: string): string {
  const files = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    );
  const hash = createHash("sha256");
  for (const path of files(root).sort((a, b) =>
    relative(root, a).localeCompare(relative(root, b)),
  )) {
    hash.update(relative(root, path).split("\\").join("/"));
    hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

interface LockEntry {
  source: string;
  ref?: string;
  computedHash: string;
}
interface SourceRequest {
  source: string;
  skills: string[];
  ref?: string;
}

export function skillConsistencyProblems(root: string): string[] {
  const problems: string[] = [];
  for (const workspace of ["", "skills"]) {
    const directory = join(root, workspace);
    const lock: { skills: Record<string, LockEntry> } = JSON.parse(
      readFileSync(join(directory, "skills-lock.json"), "utf8"),
    );
    const manifest: { skills: SourceRequest[] } = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    for (const [name, entry] of Object.entries(lock.skills)) {
      const installed = join(directory, ".agents/skills", name);
      if (!existsSync(installed)) problems.push(`${workspace || "."}: missing installed ${name}`);
      else if (skillHash(installed) !== entry.computedHash)
        problems.push(`${workspace || "."}: ${name} differs from its lock hash`);
    }
    for (const request of manifest.skills) {
      for (const name of request.skills) {
        const entry = lock.skills[name];
        const source = request.source.startsWith("npm:")
          ? request.source.slice(4)
          : request.source.split("/").slice(0, 2).join("/");
        if (!entry || entry.source !== source || entry.ref !== request.ref)
          problems.push(`${workspace || "."}: ${name} does not match the declared source/ref`);
      }
    }
    if (workspace === "skills") {
      const declared = manifest.skills.flatMap((request) => request.skills).sort();
      const installed = readdirSync(join(directory, ".agents/skills")).sort();
      if (
        JSON.stringify(declared) !== JSON.stringify(installed) ||
        JSON.stringify(declared) !== JSON.stringify(Object.keys(lock.skills).sort())
      )
        problems.push("skills: vendored inventory differs from declarations or lock");
    }
  }
  const authored = join(root, "skills/authored");
  for (const name of readdirSync(authored)) {
    const installed = join(root, ".agents/skills", name);
    if (!existsSync(installed) || skillHash(join(authored, name)) !== skillHash(installed))
      problems.push(`authored ${name}: synchronize the root installation`);
  }
  return problems;
}
