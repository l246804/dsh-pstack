/**
 * Public entry point for the dsh-pstack bundle.
 *
 * The bundle patch mounts this module as the `pstack` row. It registers one
 * skill provider that serves every generated pstack skill.
 */
export { apply, inject, name, skillsRoot, skillsRootUrl, type Config } from "./provider.ts";
