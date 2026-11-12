import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateRawTree } from "./generate.ts";

const playground = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = generateRawTree({
  upstreamRoot: resolve(playground, "../upstream/cursor-plugins"),
  outputRoot: join(playground, "raw/generated"),
});
console.log(`raw tree: ${result.skillCount} skills, digest=${result.treeDigest}`);
console.log(`output=${result.outputRoot}`);
