import type { EnvironmentMatrix } from "../types.ts";

/** Capability probes run in base unless a probe explicitly requires a special environment. */
export const environments: readonly EnvironmentMatrix[] = [
  {
    id: "preview",
    description:
      "手动预览专用环境，仅供 playground:open 启动 adapted/preview worker，不参与 probe 选择。",
    kind: "capability",
    enabledPluginPackages: [],
  },
  {
    id: "base",
    description: "默认环境，不加载额外插件，用于观察原生 DSH 能力。",
    kind: "base",
    enabledPluginPackages: [],
  },
  {
    id: "render",
    description:
      "用于验证 mermaid、图表、图片、视频和 UI 渲染能力；显式作为 native/adapted 的对照环境。",
    kind: "capability",
    enabledPluginPackages: ["dsh-genui"],
  },
  {
    id: "agent-team",
    description:
      "Team-on 环境：prepare 在 profile cordis.patch.yml 写入 agent-team.defaultEnabled=true，验证 pstack 执行者作为 teammate、共享任务板、owner 绑定、消息续跑与中断。",
    kind: "capability",
    enabledPluginPackages: [],
    teamMode: true,
  },
  {
    id: "ui",
    description: "Agent 客户端交互验证专用环境，使用独立的 adapted worker 和浏览器。",
    kind: "capability",
    enabledPluginPackages: [],
  },
];

/** Stable index used to give each environment a disjoint host-port block. */
export function environmentOffset(id: string): number {
  const index = environments.findIndex((environment) => environment.id === id);
  if (index < 0) throw new Error(`unknown playground environment: ${id}`);
  return index;
}
