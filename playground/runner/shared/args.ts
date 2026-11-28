import { isVariant, type Variant } from "../types.ts";

/** Read the value following one CLI flag. */
export function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function requiredArg(flag: string): string {
  const value = argValue(flag);
  if (!value || value.startsWith("--")) throw new Error(`${flag} is required`);
  return value;
}

export function variantArg(): Variant {
  const value = argValue("--variant");
  if (!isVariant(value)) throw new Error("--variant must be native or adapted");
  return value;
}

export function workerArg(): number {
  const value = Number(argValue("--worker") ?? "0");
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("--worker must be non-negative");
  return value;
}

export function positiveIntegerArg(flag: string): number | undefined {
  const raw = argValue(flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${flag} must be positive`);
  return value;
}

export function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
