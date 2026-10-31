# Match Scope paths

Use this one matcher for every `Scope` check in `decision-write` and `decision-audit`: changed paths, implementation paths, and existing files.

Treat `Scope` as comma-separated Git ignore globs, anchored at the repository root. Paths are repository-relative with `/` separators. `*` stays within one path segment; `**` spans segments. A glob that matches a directory also covers its descendants: for example, `src/*` matches `src/client/index.ts` through `src/client/`.

Initialize an isolated temporary Git directory once per run so the repository's own ignore rules cannot affect the result. For each glob, remove a leading `./` and any trailing `/`; reject a leading `/`, a `..` segment, or a newline. Test both forms:

```bash
sandbox="$(mktemp -d)"
git init -q "$sandbox"
printf '/%s\n/%s/**\n' "$glob" "$glob" >"$sandbox/rules"
git -C "$sandbox" -c core.excludesFile="$sandbox/rules" check-ignore -v --no-index -- "$path"
```

The only files in the sandbox are Git metadata and the rule file; it needs no checkout. Overwrite the rule file for each glob, then remove the verified temporary directory after the run. The path is matcher input, not a file that must exist. Accept a match only when the verbose output names `$sandbox/rules` as its source. Exit 0 with that source is a match. Exit 1 is no match; report any other exit code with its error. Record each matching glob and path. Every record matches when at least one of its globs matches at least one selected path.
