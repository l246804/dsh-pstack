import type { BehaviorScenario } from "../types.ts";

export const whyRetryRationale: BehaviorScenario = {
  type: "behavior",
  id: "why-retry-rationale",
  skill: "why",
  turns: [
    {
      prompt:
        "src/fetch.mjs 里这段重试为什么要重试三次、还加了指数退避？我想搞清楚当初是出于什么考虑这么写的。别猜，能引证据就引证据，也告诉我哪些证据源其实查不到。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "nightly-import",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
`,
      "src/fetch.mjs": `const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

// Upstream returns HTTP 429 when a bulk pull bursts; three attempts with
// exponential backoff keep the nightly import under the provider's rate limit.
export async function fetchWithRetry(url, doFetch = fetch) {
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    const response = await doFetch(url);
    if (response.status !== 429) {
      return response;
    }
    attempt += 1;
    await sleep(BASE_DELAY_MS * 2 ** attempt);
  }
  throw new Error("gave up after " + MAX_ATTEMPTS + " attempts");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
`,
      "src/fetch.test.mjs": `import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "./fetch.mjs";

test("retries a 429 and succeeds on the third attempt", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return { status: calls < 3 ? 429 : 200 };
  };
  const response = await fetchWithRetry("https://example.test/data", fakeFetch);
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});
`,
      "docs/adr/0007-nightly-import-retry.md": `# 0007 Nightly import retry policy

The nightly import used to fail whenever the upstream provider throttled us during the
bulk pull. The provider returns HTTP 429 once a burst exceeds its per-minute budget.

We settled on three attempts with exponential backoff (200ms, 400ms, 800ms). This keeps
the import under the provider's rate limit instead of hammering it. A longer retry
budget was rejected because it pushed the nightly job past its window.

We did not add circuit breaking: the job runs once a day, so a single failed run is
cheaper than the complexity.
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "why" },
    { kind: "assistant-contains", text: "429" },
    { kind: "assistant-contains", text: "MCP" },
  ],
  rubric: {
    prompt:
      "回答应把问题重述、锚定到 src/fetch.mjs 的具体代码，再用证据分层（直接/支持/推断）说明：429 限流促成了三次尝试与指数退避，依据是代码注释、ADR 与测试；同时明确记录哪些外部证据源查不到（如问题单、聊天、长文文档、可观测性等 MCP 在本环境不可用，且无 git 历史），把这些记为缺口而非用猜测填补。gap：编造 PR/工单/聊天等不存在的引用；把代码自身当作动机的证据；把意图当事实陈述而无证据层级；或漏掉不可用证据源的说明。技能加载是过程证据，不等于归因有效。",
  },
  uiObservations: [
    {
      id: "confidence-tiers",
      description: "回复区分直接证据、推断与未知，而非一律用肯定语气。",
    },
    {
      id: "sources-consulted",
      description: "回复列出实际查证与不可用的证据源，含 MCP 不可用的说明。",
    },
    {
      id: "gaps-named",
      description: "明确写出无法查到的具体缺口，而不是含糊带过。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/why/SKILL.md",
    regression:
      "guards why's cited, confidence-tiered investigation and its degraded path when evidence MCPs are absent: name unavailable sources and ground the conclusion in code and local history instead of guessing.",
  },
};
