/** Host platform decisions, kept in one place so the sandbox stays platform-neutral. */
export const IS_MACOS = process.platform === "darwin";
export const IS_WINDOWS = process.platform === "win32";

export function hostCommandShell(): boolean {
  return IS_WINDOWS;
}

/** Candidate Chrome binaries for the three host layouts. */
export function chromeCandidates(root: string, names: readonly string[]): string[] {
  const candidates: string[] = [];
  for (const name of names) {
    candidates.push(joinVariant(root, name, "chrome"));
    candidates.push(joinVariant(root, name, "chrome.exe"));
    candidates.push(joinVariant(root, name, "Google Chrome.app/Contents/MacOS/Google Chrome"));
  }
  if (IS_MACOS) {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  }
  if (IS_WINDOWS) {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (base) candidates.push(joinVariant(base, "Google/Chrome/Application", "chrome.exe"));
    }
  }
  return candidates;
}

function joinVariant(root: string, name: string, leaf: string): string {
  // Kept as a tiny helper so platform.ts does not import path semantics twice.
  return `${root}/${name}/${leaf}`;
}
