# skills 目录

本目录维护随包发布的技能。用户用途与入口见根 README；目录来源、同步与发布关系如下。

| 来源 | 维护方式 | 发布位置 |
| --- | --- | --- |
| `authored/` | 本仓手写来源 | `dist/skills/authored/` |
| `.agents/skills/` | 按本目录 `package.json` 的来源/ref 同步，`skills-lock.json` 记录内容哈希 | `dist/skills/vendored/` |
| 根 `.agents/skills/` | 仓库开发时的安装副本，使用根配置与锁文件 | 不随包发布 |

## 修改与同步

- 修改 authored 来源后，在仓库根运行 `vp exec skills add ./skills/authored -y -a universal --copy`，提交来源、根安装副本和根 `skills-lock.json`。
- 更新 vendored 时修改本目录 `package.json` 的来源/ref，在本目录运行 `vp run prepare`，提交配置、vendored 副本和本目录锁文件。根开发工具与发布技能分别钉定，无需强制使用相同 ref。

## 用户文档

新增、删除、改名技能，或改变用途、来源后，核对根 README 各语言版本，更新受影响的清单、入口和署名；无需变更时报告“根 README 无差异”。
