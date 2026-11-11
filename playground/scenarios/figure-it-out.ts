import type { BehaviorScenario } from "../types.ts";

export const figureItOutVarMigration: BehaviorScenario = {
  type: "behavior",
  id: "figure-it-out-var-migration-playbook",
  skill: "figure-it-out",
  turns: [
    {
      prompt:
        "这个老项目里到处是 var，我想全部迁到 let/const 同时保证行为不变。别直接动手改，先给我设计一份可审计的迁移方案：怎么算迁移完成、范围大概多大、按什么顺序拆成能独立落地的小步、每一步怎么验证不改变行为、决策和进度记在哪。整理成文档放到 docs/migration-playbook.md。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "legacy-counter",
  "version": "1.0.0",
  "scripts": {
    "test": "node test/smoke.js",
    "build": "node scripts/build.js"
  }
}
`,
      "src/app.js": `var state = { count: 0 };

function increment() {
  var next = state.count + 1;
  state.count = next;
  return next;
}

module.exports = { increment };
`,
      "src/util.js": `var MAX = 100;

function clamp(value) {
  var bounded = value;
  if (bounded > MAX) {
    bounded = MAX;
  }
  return bounded;
}

module.exports = { clamp };
`,
      "src/render.js": `var { increment } = require("./app.js");

function render() {
  var value = increment();
  return "count=" + value;
}

module.exports = { render };
`,
      "test/smoke.js": `var assert = require("node:assert");
var { increment } = require("../src/app.js");
var { clamp } = require("../src/util.js");
var { render } = require("../src/render.js");

assert.strictEqual(increment(), 1);
assert.strictEqual(clamp(150), 100);
assert.strictEqual(render(), "count=2");
console.log("smoke ok");
`,
      "scripts/build.js": `var fs = require("node:fs");
var path = require("node:path");
var files = ["src/app.js", "src/util.js", "src/render.js"];
for (var i = 0; i < files.length; i++) {
  var source = fs.readFileSync(path.join(__dirname, "..", files[i]), "utf8");
  if (source.length === 0) throw new Error("empty file: " + files[i]);
}
console.log("build ok");
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "figure-it-out" },
    { kind: "artifact-contains", path: "docs/migration-playbook.md", text: "const" },
    { kind: "assistant-contains", text: "验证" },
  ],
  rubric: {
    prompt:
      "方案应先给出可证伪的完成定义（不再有 var、构建与测试通过、行为不变），量化范围（文件与工量估计），标明严格度与理由，把工作拆成可独立落地且按风险排序的小步，且在工作开始前先搭验证基线（记录改动前的 test/build 结果）；同时指明决策与进度的记录位置。gap：只给一串待办而没有完成定义；未设计验证或没有基线；直接开始改代码；未说明范围或严格度。技能加载是过程证据，不等于方案可审计。",
  },
  uiObservations: [
    {
      id: "playbook-rendered",
      description: "浏览器里能看到 docs/migration-playbook.md，含完成定义、步骤与验证设计。",
    },
    {
      id: "phases-ordered",
      description: "回复呈现阶段化、按风险排序的迁移步骤，而非随手改文件。",
    },
    {
      id: "baseline-mentioned",
      description: "文档说明先记录改动前的 test/build 基线再动手。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/figure-it-out/SKILL.md",
    regression:
      "guards figure-it-out's bespoke auditable playbook: falsifiable done predicate, quantified scope, ordered atomic units, a verification harness with a captured baseline, and a decision trail.",
  },
};
