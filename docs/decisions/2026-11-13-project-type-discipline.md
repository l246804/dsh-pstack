# 决策：全项目类型优先，减少防御代码与类型转换

Status: accepted
Date: 2026-11-13
Scope: src/**, playground/**, tests/**, scripts/**, tsconfig.json, playground/tsconfig.json, docs/decisions/**
Implemented-by: commit:f613f24
Review: 2026-11-22

## 背景

项目里曾用手写 `import-meta.d.ts` 补充 Vite 类型，也存在用运行时 shape guard 或无必要的类型强转来绕过已有类型定义的情况。问题不在于 `Omit`、`Pick`、`Partial` 或 `as` 本身；它们在该用的时候是准确表达结构关系的工具。需要约束的是无必要的防御代码、重复结构定义和绕过类型系统的强转。

## 决策

- 所有项目 TS 源码优先相信类型定义；先定义清晰接口和导出类型，再写实现。
- 可静态导入的内部模块必须显式声明导出类型；调用方直接使用该类型，不用 `unknown` 加运行时 guard 绕过类型系统。
- 类型工具按必要性使用：当 `Omit`、`Pick`、`Partial`、`Required` 能准确表达与基础类型的关系、减少重复时应当使用。
- 避免的是无必要的类型强转、重复接口定义、为绕过类型系统而加的 `unknown` 守卫，以及无必要的非空断言和防御链；只有类型系统无法静态保证的外部边界才做运行时校验。
- 外部 JSON、进程参数、网络输入和运行时文件仍必须在边界处校验，不能把“类型优先”误解为“无条件信任外部数据”。
- Vite 的 `import.meta.glob` 类型通过 `vite-plus/client` 在 tsconfig 中提供；不维护手写 `import-meta.d.ts`。
- 以上规则适用于 `src`、`playground`、`tests`、`scripts` 和根配置，不是某个子目录的局部约定。

## 替代方案

**继续维护手写 `import-meta.d.ts`。** 这会与 Vite+ 的类型漂移，并需要手动维护全局声明；该方案被否决。

**机械禁用 `Partial`、`Pick`、`Omit` 和 `as`。** 这会把合理的类型关系表达也一并禁止，例如从基础组件的属性中排除 `width`/`height` 后再扩展；该方案被否决。

**只在 playground 执行类型优先规则。** 这会让主源码和测试代码继续积累防御代码，无法统一维护；该方案被否决。

## 后果

- 类型定义成为结构的第一来源，内部实现减少重复校验；合理的类型工具仍可使用。
- 外部边界仍然保留必要的运行时验证，边界内外职责更清楚。
- 新增代码需要先定义接口和导出类型，短期多写一点类型声明，长期减少隐式耦合。
