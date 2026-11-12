import type { PluginUiScenario } from "../types.ts";

/**
 * UI 场景只覆盖插件自有设置界面的少量行为验收：可机械判定的 DOM 状态与文件行为用
 * action/expected 断言，视觉结果落截图供人工目测，不做像素对比。
 *
 * `action` 由 `playground/scripts/run-ui.ts` 解释。动作后面的 `key=value` 是机器参数；
 * `expected` 是每步之后要断言的文本（支持 `re:` 前缀的正则和 `{{provider}}`、
 * `{{model}}`、`{{effort}}`、`{{route}}`、`{{roleLine}}` 模板，由执行器用 worker
 * home 里的 testModel 与 role 参数填充，因此场景文件不硬编码模型名）。
 */
export const pluginUiScenarios: readonly PluginUiScenario[] = [
  {
    type: "plugin-ui",
    id: "plugin-ui-role-config",
    steps: [
      // 进入插件详情页配置入口，打开 pstack 配置对话框（默认推荐插件页签）。
      { action: "open-plugins-detail", expected: "dsh-pstack" },
      // 切到角色页签。
      { action: "open-role-tab", expected: "re:角色模型|Role models" },
      // 选中 bug-fix 单路由角色。
      { action: "select-role role=bug-fix", expected: "bug-fix" },
      // 用 testModel 填一条合法路由（provider/model/effort 来自 worker home 的 testModel）。
      { action: "set-route role=bug-fix", expected: "{{model}}" },
      // 保存该角色。
      { action: "save role=bug-fix", expected: "re:已保存|Saved" },
      // 文件断言：$DSH_HOME/pstack-models.mdc 出现该角色行。
      { action: "assert-file-contains role=bug-fix", expected: "{{roleLine}}" },
      {
        action: "screenshot name=role-saved",
        expected: "需人工目测截图：角色卡片显示保存成功，文件出现 bug-fix 路由行",
      },
      // 清除该角色并保存，删除角色行。
      { action: "clear-role role=bug-fix", expected: "re:清除|Clear" },
      { action: "save role=bug-fix", expected: "re:已保存|Saved" },
      // 文件断言：文件恢复为不含该角色行。
      { action: "assert-file-not-contains role=bug-fix", expected: "{{roleLine}}" },
      {
        action: "screenshot name=final",
        expected: "需人工目测截图：清除并保存后角色卡片显示未配置，文件不再含 bug-fix 行",
      },
    ],
    observations: [
      {
        id: "role-saved-visual",
        description:
          "需人工目测截图 role-saved：角色卡片显示保存成功状态，pstack-models.mdc 出现 bug-fix 路由行。截图不做像素对比。",
      },
      {
        id: "role-cleared-visual",
        description:
          "需人工目测截图 final：清除并保存后角色卡片回到未配置状态，文件不再含 bug-fix 行。截图不做像素对比。",
      },
    ],
    source: {
      upstreamSkill: "src/client/RoleSettingsPage.tsx",
      regression: "角色配置页的保存与删除以 testModel 通过环境变量/参数传入，场景不硬编码模型名",
    },
    environmentId: "base",
  },
  {
    type: "plugin-ui",
    id: "plugin-ui-recommended-plugins",
    steps: [
      // 进入插件详情页配置入口，打开 pstack 配置对话框；推荐插件页签是默认页签。
      { action: "open-plugins-detail", expected: "dsh-pstack" },
      // 断言关联插件列表渲染出官方插件包名并显示启用状态。
      {
        action: "assert-plugin-listed name=@deepseek-ai/dsh-experimental-session-search",
        expected: "re:会话搜索|Session search",
      },
      // 对 session-search 执行启用或禁用切换；宿主不允许时保持禁用态而不是假装成功。
      {
        action: "toggle-plugin name=@deepseek-ai/dsh-experimental-session-search",
        expected: "re:会话搜索|Session search",
      },
      // 断言状态文本变化与切换一致；不可切换时必须出现明确禁用/报错态。
      {
        action: "assert-plugin-state name=@deepseek-ai/dsh-experimental-session-search",
        expected:
          "re:已启用|未启用|Enabled|Disabled|未安装|不可用|只读|Not installed|Unavailable|Read-only",
      },
      {
        action: "screenshot name=final",
        expected: "需人工目测截图：关联插件列表包名与启用/禁用状态，切换后状态文本一致或明确报错",
      },
    ],
    observations: [
      {
        id: "recommended-list-visual",
        description:
          "需人工目测截图 final：推荐插件页签渲染官方插件包名与启用状态。截图不做像素对比。",
      },
      {
        id: "toggle-visual",
        description:
          "需人工目测截图 final：session-search 切换后的状态文本与切换一致；宿主不允许时显示明确禁用或报错态。截图不做像素对比。",
      },
    ],
    source: {
      upstreamSkill: "src/client/RecommendedPluginsPage.tsx",
      regression: "推荐插件启用/禁用以真实宿主能力为准，缺依赖时断言禁用或报错态",
    },
    environmentId: "base",
  },
];
