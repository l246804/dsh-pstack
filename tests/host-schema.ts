/**
 * The Host's own JSON Schema machinery, for tests that assert a tool's contract.
 *
 * These are imported from `@deepseek-ai/dsh-tools` rather than reimplemented.
 * The whole point of the assertion is "the real registry accepts this value", and
 * a local copy would encode this repository's *understanding* of the subset —
 * which is exactly what was wrong when `signal: null` shipped: the schema said
 * `string`, the runtime wrote `null`, and no test could notice because nothing
 * ever asked the Host.
 *
 * Installed as a devDependency; `src/` still imports nothing from the Host.
 * `docs/decisions/2026-10-26-real-assembly-test-harness.md` records the trade.
 */
import {
  assertSupportedJsonSchema,
  jsonSchemaToTs,
  validateJsonSchemaValue,
} from "@deepseek-ai/dsh-tools";

export { assertSupportedJsonSchema, jsonSchemaToTs, validateJsonSchemaValue };

/**
 * Every reason `value` fails `schema`, using the Host's own validator.
 *
 * An empty array means the Host would accept the value as a tool result.
 */
export function violations(schema: unknown, value: unknown): readonly string[] {
  return validateJsonSchemaValue(schema as never, value, "value") as unknown as readonly string[];
}
