/** Preset gate for the session-scoped poteto workflow. */

/**
 * Preset ids the poteto workflow cannot run under: a fixed system prompt, or no
 * skill tools to load the poteto-mode skill. Extend this set when another preset
 * cannot run the workflow.
 *
 * `minimal` ships a fixed complete system prompt and no skill tools.
 */
const POTETO_INCAPABLE_PRESETS: ReadonlySet<string> = new Set(["minimal"]);

/**
 * Whether the poteto workflow may run for a session composed from `agentPreset`.
 * A missing id stays available, matching deployments that do not compose a
 * preset per session.
 */
export function potetoSupportsPreset(agentPreset: string | undefined): boolean {
  return agentPreset === undefined || !POTETO_INCAPABLE_PRESETS.has(agentPreset);
}

/** Whether one Session runs the poteto workflow, from its preset, saved switch, and global default. */
export function resolvePotetoEnabled(input: {
  readonly agentPreset: string | undefined;
  readonly selected: boolean | undefined;
  readonly byDefault: boolean;
}): boolean {
  return potetoSupportsPreset(input.agentPreset) && (input.selected ?? input.byDefault);
}

/**
 * Whether a new Session should record its resolved default as an explicit
 * selection. Every capable Session gets one at creation, so a later change to
 * the global default cannot silently flip an existing Session.
 */
export function shouldSeedPotetoDefault(input: {
  readonly agentPreset: string | undefined;
  readonly selected: boolean | undefined;
}): boolean {
  return potetoSupportsPreset(input.agentPreset) && input.selected === undefined;
}
