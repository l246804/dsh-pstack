/**
 * The patch vocabulary.
 *
 * A patch either rewrites matched text (`rename`, `path`, `replace`) or removes
 * it (`drop`). The union keeps the illegal pairings unrepresentable: a drop has
 * no replacement to apply, and a rewrite cannot omit one.
 */

export type RewritingPatchKind = "rename" | "path" | "replace";

interface PatchTarget {
  /** Asset-relative POSIX path, identical to the upstream-relative path. */
  readonly file: string;
  readonly reason: string;
  readonly anchor: string | RegExp;
  readonly expectedMatches: number;
  /** Fragments that must survive in the final generated text. */
  readonly outputIncludes?: readonly string[];
}

export interface RewritingPatch extends PatchTarget {
  readonly kind: RewritingPatchKind;
  readonly replacement: string;
}

export interface DropPatch extends PatchTarget {
  readonly kind: "drop";
}

export type FilePatch = RewritingPatch | DropPatch;

export interface SkillExclusion {
  readonly kind: "exclude";
  readonly skill: string;
  readonly reason: string;
}
