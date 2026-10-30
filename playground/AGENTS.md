# playground agent 须知

- 启动端口固定 `17353`（硬性规定），禁止自行改端口或改用随机端口。
- 启动前先探测 17353：若已有 `vp run playground` 实例（profile 刚被 `start.mjs` 同步、`dsh web` 有响应，通常是用户手动启动）则沿用、不要抢占；否则遇占用必须先问用户「中止任务还是换端口」，确认前不得继续（只有用户确认后才可用 `PLAYGROUND_PORT`）。
- 启动用 `vp run playground`（task 在根 `vite.config.ts`）；改了插件源码先 `vp run build` 再重启。
- 运行期 DSH home 是 `playground/.dsh`（已 gitignore）；不要另建测试用 home/profile。
- 端口冲突时 `start.mjs` / `dsh` 会直接失败、不会悄悄换端口；这是有意的。
