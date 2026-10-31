# 匹配 Scope 路径

`decision-write` 与 `decision-audit` 的所有 `Scope` 检查都使用这一个匹配器：改动路径、实现路径与现存文件均相同。

`Scope` 是逗号分隔、以仓库根目录为锚点的 Git ignore glob。路径使用仓库相对形式和 `/` 分隔符。`*` 不跨路径段，`**` 可以跨段；匹配目录的 glob 也覆盖其所有后代，例如 `src/*` 通过匹配 `src/client/` 而匹配 `src/client/index.ts`。

每次运行初始化一个隔离的临时 Git 目录，避免仓库自身的 ignore 规则影响结果。对每个 glob 去掉开头的 `./` 与末尾的 `/`；拒绝以 `/` 开头、包含 `..` 路径段或换行的 glob。再测试两种形式：

```bash
sandbox="$(mktemp -d)"
git init -q "$sandbox"
printf '/%s\n/%s/**\n' "$glob" "$glob" >"$sandbox/rules"
git -C "$sandbox" -c core.excludesFile="$sandbox/rules" check-ignore -v --no-index -- "$path"
```

沙箱中只有 Git 元数据和规则文件，无需检出。每个 glob 都覆盖写入规则文件，运行结束后删除已确认路径的临时目录。路径是匹配器输入，不要求文件存在。仅当详细输出把 `$sandbox/rules` 标为来源时才接受匹配。退出码为 0 且来源正确即匹配；退出码为 1 则不匹配；其他退出码连同错误一起报告。记录每个匹配的 glob 与路径。只要任一 glob 匹配任一所选路径，该记录即匹配。
