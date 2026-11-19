# 决策：测试按包归属，runner 按领域组织

Status: proposed
Date: 2026-11-19
Scope: tests/**, src/**, playground/**, vite.config.ts, tsconfig.json, docs/architecture.md, docs/decisions/**
Implemented-by: -
Review: 2026-11-19

## 背景

仓库已经分成多个子包：src 是产品实现，playground 是真实 DSH 验证场，native 是基准包，根 tests 同时保存多个包的测试。测试与实现跨目录后，修改一个包需要跨包查找测试，包边界无法用目录表达；runner/lib 平铺把容器、浏览器、配置、worker、证据、场景等领域混在一起，阅读者必须先了解实现细节才能定位文件。容器化后旧的 host/profile/pid 执行路径已不再成立，残留辅助代码继续增加阅读负担。

## 决策

- 测试按包归属：src/tests 保存产品实现测试，playground/tests 保存验证场测试；根 tests 只保留跨包的仓库级测试，例如发布兼容性。
- runner 按领域组织：case、container、browser、config、worker、evidence、scenario、shared；cli 只做入口，同领域的状态和辅助函数放在同一目录。
- 删除旧 host 执行路径和死代码；容器是 playground worker 的唯一执行方式。
- 新增测试必须放在对应包的 tests 目录；只有跨包测试放根 tests。

## 替代方案

**继续把所有测试放根 tests。** 测试与包边界脱节，修改一个包要跨目录查找，新增子包时无法通过目录看出归属；否决。

**继续 runner/lib 平铺。** 同领域文件分散，定位需要先了解实现细节；否决。

**提前拆分 types.ts。** 当前类型量小且跨领域共用，拆成多个类型文件只增加导入层数；暂不做，等出现真实循环依赖再拆。

## 后果

- 包内测试与实现同目录，包的边界和职责直接可见。
- vp test 覆盖 tests、src/tests、playground/tests 三处；各包的 typecheck 分别覆盖自己的测试。
- 根 tests 只剩仓库级发布测试，新增跨包测试时才增加文件。
- 历史决策记录中的旧路径保留，不回写；本决策只约束当前实现。
