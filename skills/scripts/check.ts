import { fileURLToPath } from "node:url";
import { skillConsistencyProblems } from "./lib/consistency.ts";

const problems = skillConsistencyProblems(fileURLToPath(new URL("../..", import.meta.url)));
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
else console.log("Skill sources, installed copies and lock hashes agree.");
