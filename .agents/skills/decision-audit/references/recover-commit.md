# Recover a rewritten commit

When an `Implemented-by: commit:SHA` is outside `<base>` but its object remains available, recover its patch identity before reporting it as lost:

```bash
git show <dead-sha> | git patch-id --stable
```

Search plausible replacements within the record's date and scope:

```bash
git log --since=<Date> --format=%H -- <Scope paths> |
  while read -r sha; do git show "$sha" | git patch-id --stable; done |
  grep -F "<patch-id>"
```

A match supports suggesting the replacement SHA; otherwise leave replacement to a human. Prefer PR anchors in squash-merged repositories.
