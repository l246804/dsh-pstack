/**
 * The tree's own README, written from this repository rather than copied from upstream.
 *
 * Upstream's harness README answers "where did this folder come from" for a folder whose
 * siblings are all upstream's. That answer is wrong here: `pstack/` also holds hand-written
 * scripts, an overlay, and the script sources, so the subject has to be the generated
 * `pstack/pstack/` tree and the sentence has to name only files that exist.
 *
 * It lives in a module rather than on disk because the tree is replaced wholesale on every
 * build. A file that has to survive that belongs in `pstack/docs/`, and this one belongs to
 * the tree itself, not to a page a reader may override.
 */

export const PORT_README = `# pstack port

This folder is generated from \`pstack/runtime/\`, the upstream pstack submodule, and the overlay in \`pstack/docs/\`. Do not edit it by hand: a build replaces every file here.

DeepSeek Harness installs \`dist/pstack\`, which is this tree. The tree carries \`skills/\`, \`agents/\`, and \`docs/\`, and nothing else.

After editing a source, run \`vp run build:port\` from the repository root and commit the result.
`;
