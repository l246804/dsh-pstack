/** Error raised when a wire value fails its strict decoder, plus the shared wire guards. */

export class WireTypeError extends TypeError {
  constructor(path: string, expected: string) {
    super(`${path}: expected ${expected}`);
    this.name = "WireTypeError";
  }
}

/** Narrow one unknown wire value to a plain object record, or throw. */
export function parseRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WireTypeError(path, "an object");
  }
  return value as Record<string, unknown>;
}

/** Read an optional string member of a wire record, or throw when present but not a string. */
export function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  const value = record[key];
  if (value !== undefined && typeof value !== "string") {
    throw new WireTypeError(`${path}.${key}`, "a string when present");
  }
  return value;
}
