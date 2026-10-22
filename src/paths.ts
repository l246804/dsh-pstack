/**
 * Locate one pstack skill directory inside this package.
 *
 * The provider registers candidates from an explicit file list, so this helper
 * resolves the directory the built entry point and the tests share.
 */
import { fileURLToPath } from "node:url";

export const SKILLS_ROOT_URL = new URL("../assets/skills/", import.meta.url);
export const AGENTS_ROOT_URL = new URL("../assets/agents/", import.meta.url);
export const SKILLS_ROOT = fileURLToPath(SKILLS_ROOT_URL);
export const AGENTS_ROOT = fileURLToPath(AGENTS_ROOT_URL);
