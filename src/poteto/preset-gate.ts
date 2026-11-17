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
 * Whether a new Session should record an explicit on selection from the global
 * default. Seeding the selection makes the saved value match what
 * {@link resolvePotetoEnabled} already reports, so the client projection and the
 * running session agree without a default lookup on the browser side.
 */
export function shouldSeedPotetoDefault(input: {
  readonly agentPreset: string | undefined;
  readonly selected: boolean | undefined;
  readonly byDefault: boolean;
}): boolean {
  return potetoSupportsPreset(input.agentPreset) && input.selected === undefined && input.byDefault;
}
