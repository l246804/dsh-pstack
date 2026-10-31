# 恢复被改写的提交

`Implemented-by: commit:SHA` 不在 `<base>` 中、但其对象仍可用时，先恢复 patch 标识，再报告提交丢失：

```bash
git show <dead-sha> | git patch-id --stable
```

在记录的日期与范围内搜索可能的替代提交：

```bash
git log --since=<Date> --format=%H <base> -- |
  while read -r sha; do git show "$sha" | git patch-id --stable | awk -v sha="$sha" '{print $1, sha}'; done |
  grep -F "<patch-id>"
```

比较 patch 标识前，先用共享 `Scope` 匹配器筛选每个候选提交的路径。命中可支持建议改用替代 SHA；未命中则留给人判断替代项。使用 squash 合并的仓库优先采用 PR 锚点。
