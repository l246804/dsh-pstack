import type { BehaviorScenario } from "../types.ts";

export const swarmBoundaryScan: BehaviorScenario = {
  type: "behavior",
  id: "swarm-boundary-scan",
  skill: "swarm",
  turns: [
    {
      prompt:
        "src 下这几个工具函数我想统一过一遍健壮性。请并行地把 safeDivide、parseConfig、clamp、slugify 都查一下有没有没处理的边界或会直接抛异常的情况，最后汇总成一张表，列出每个文件的问题和是否确认。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "toolbox",
  "version": "0.1.0",
  "type": "module"
}
`,
      "src/safeDivide.mjs": `export function safeDivide(numerator, denominator) {
  return numerator / denominator;
}
`,
      "src/parseConfig.mjs": `export function parseConfig(text) {
  return JSON.parse(text);
}
`,
      "src/clamp.mjs": `export function clamp(value, min, max) {
  if (min > max) throw new RangeError("min must be <= max");
  return Math.min(Math.max(value, min), max);
}
`,
      "src/slugify.mjs": `export function slugify(input) {
  if (typeof input !== "string") throw new TypeError("input must be a string");
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "swarm" },
    { kind: "assistant-contains", text: "safeDivide" },
    { kind: "assistant-contains", text: "parseConfig" },
    { kind: "assistant-contains", text: "slugify" },
  ],
  rubric: {
    prompt:
      "最终应是一份合并后的报告：一张覆盖全部四个切片的表，每行给出文件、PASS 或 ISSUES 与证据；safeDivide（分母为 0 未设防）与 parseConfig（未包裹 JSON.parse）应被标为确认问题并附一句说明，clamp 与 slugify 应判为通过；同时说明是否有切片缺口或工人掉线。gap：漏查部分文件；只贴各工人的原始输出而未合并；问题没有证据；或把已防护的文件误报为问题。技能加载是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "consolidated-table",
      description: "回复中出现合并后的结果表，覆盖四个文件而非粘贴多段原始输出。",
    },
    {
      id: "pass-issues-marks",
      description: "每个切片带 PASS/ISSUES 结论与简短依据，问题项可读。",
    },
    {
      id: "gaps-noted",
      description: "若有切片缺口或工人掉线，报告中有明确说明。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/swarm/SKILL.md",
    regression:
      "guards swarm's fan-out-and-drain behavior: parallel slices each return a result and the run yields one consolidated coverage report with per-slice verdicts.",
  },
};
