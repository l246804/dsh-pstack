# prepare：整理移植树与构建链路

在初次移植、上游更新或上一轮结束后、`audit` 前整理结构与移植机制。只处理目录、源码位置、本地适配树、生成与替换链路；需求调查、功能实现和适配文档留给后续分支。

入口先检查 `docs/port-state.yaml`。blocker 非空时，本分支不在 `allowed_routes`，拒绝并报告 blocker。`port.state: active` 时先继续当前 port 阶段；只有 `idle` 才能整理结构。

## 1. 建立结构追踪

读取适用的 accepted 决策、`<pstack>/docs/harness/` 和上游生成脚本，枚举上游目录、本地适配树、runtime 与生成脚本，建立“上游路径 → 手写位置 → 生成位置 → 随包位置”核对表。当前实现只用于定位结构偏差，不用于反推需求。

完成标准：每类上游资产都有唯一去向；每项偏差定位到具体路径；上游子模块与生成树未被当作手写源。

## 2. 整理适配树与 runtime 镜像

主适配器 `claude-code.md` 对应 `pstack/harness/docs/harness/dsh.md`。其他附件保持上游相对路径与文件名。清理重复或无归属适配文件，不重写上游正文，不在本阶段编写适配内容。

按 `<pstack>/skills/<技能>/scripts/**` 核对 `pstack/runtime/` 的镜像。逐脚本标为 Node 等价实现、明确不移植或尚未移植，保留入口、参数、输出和测试对应关系。行为修改留给 `implement`。

完成标准：每个上游 harness 文件恰有一个本地产物；每个脚本都有镜像路径和明确去向；没有重复主适配器或散置实现。

## 3. 验证生成与替换链路

沿 package scripts 与构建配置核对：生成器从上游原文和本地适配树渲染 `pstack/pstack/`；主适配器替换上游 CC 适配器；复制、runtime 编译、脚本替换和根发布组装逐段可追踪。

只修改结构所需文件与 `docs/port-prepare.md`。根插件实现与测试不属于本阶段，记录为后续 port 实现事项。可以运行 `node pstack/scripts/generate-pstack-harness-tree.mjs --check` 诊断；适配文档更新前不要求它通过，也不把诊断当作行为验收。

完成标准：结构、生成、复制、替换与发布路径逐段可追踪；范围内结构检查通过；生成树只由生成器改变；根插件实现未修改。

## 4. 记录并停止

在 `docs/port-prepare.md` 记录上游提交、目录映射、最小修正、诊断命令及退出码、后续实现事项与未决项。保留 README 和轮次工作文件。本分支不开始 port 轮次，也不修改 `port.state`。

完成标准：结构报告完整；没有执行需求审查或功能实现；报告最后明确写出 `/pstack-port audit`，等待用户显式调用。
