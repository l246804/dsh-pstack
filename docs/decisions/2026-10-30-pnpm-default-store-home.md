# 决定：pnpm 依赖安装使用默认 store home

Status: accepted
Date: 2026-10-30
Scope: package.json, pnpm-workspace.yaml, pnpm-lock.yaml
Implemented-by: commit:45d44ebd3f7ea93ea6a354724a5679d5d5ecd302
Review: 2027-04-30

## 背景

依赖安装验证曾把 pnpm store 放到工作区内的 `node_modules/.pnpm-store`，测试目录也可能残留 store。这样会让验证依赖仓库文件系统，增加清理负担，并掩盖用户机器上默认 store 的真实行为。

## 决定

依赖安装与真实安装验证直接运行 `pnpm install` 或等价的 pnpm 调用，不显式指定 store 目录；未指定时 pnpm 使用默认 store home。不得在仓库内创建、复用或提交项目级 store。若默认 store home 因沙箱或其他权限不可写，先向用户申请提权，批准后继续；未批准则中止当前任务，不通过项目内 store 绕过。

## 备选方案

- 在仓库内使用 `node_modules/.pnpm-store`。不选：污染工作区，权限和清理成本高，且与用户机器默认行为不一致。
- 显式传 `--store-dir` 指向用户目录。不选：用户明确要求不指定 store 目录，默认值已经指向该位置。
- 权限失败后自动改到临时项目目录继续。不选：会把验证环境与目标安装环境混在一起，也绕过了用户批准边界。

## 后果

安装行为与 pnpm 默认一致，验证不依赖项目内 store。默认 store 不可写时任务会暂停并等待用户批准；这是有意的安全边界。
