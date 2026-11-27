/** Read the value following one CLI flag. */
export function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
