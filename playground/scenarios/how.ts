import type { BehaviorScenario } from "../types.ts";

export const howRequestFlow: BehaviorScenario = {
  type: "behavior",
  id: "how-request-flow",
  skill: "how",
  turns: [
    {
      prompt:
        "这个 URL 短链服务是我从别人手里接过来的，还不太熟。帮我讲清楚从收到一个请求、到读写缓存、再到生成或解析短码这条路径是怎么走的，我想先建立一个能上手改它的整体认识。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "shortlink",
  "version": "0.1.0",
  "type": "module"
}
`,
      "src/server.mjs": `import { CacheStore } from "./store.mjs";
import { encode, decode } from "./shortener.mjs";

const store = new CacheStore();

export function handleRequest({ method, path }) {
  const id = path.slice(1);
  if (method === "GET") {
    const target = store.get(id) ?? decode(id);
    return { status: target ? 302 : 404, location: target };
  }
  if (method === "POST") {
    const newId = encode(path);
    store.set(newId, path);
    return { status: 201, location: newId };
  }
  return { status: 405 };
}
`,
      "src/store.mjs": `export class CacheStore {
  #entries = new Map();

  get(id) {
    return this.#entries.get(id);
  }

  set(id, url) {
    this.#entries.set(id, url);
  }

  has(id) {
    return this.#entries.has(id);
  }
}
`,
      "src/shortener.mjs": `const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function encode(url) {
  let hash = 0;
  for (const ch of url) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  let out = "";
  do {
    out = ALPHABET[hash % 36] + out;
    hash = Math.floor(hash / 36);
  } while (hash > 0);
  return out;
}

export function decode(id) {
  return id.startsWith("http") ? id : undefined;
}
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "how" },
    { kind: "assistant-contains", text: "CacheStore" },
    { kind: "assistant-contains", text: "handleRequest" },
  ],
  rubric: {
    prompt:
      "解释应达到资深工程师接手子系统的程度：先说清这个服务是什么、做什么，再给出关键概念（请求、短码、缓存），然后按 handleRequest -> CacheStore / shortener 的顺序逐步走运行时流程并引用具体文件与函数，最后说明各文件位置与非显而易见的坑。gap：只罗列文件或函数清单；没有逐步流程；没有引用真实符号；或只是贴源码没有心智模型。技能加载是过程证据，不等于解释有效。",
  },
  uiObservations: [
    {
      id: "flow-explained",
      description: "回复含从入口到缓存再到短码处理的逐步说明，而非文件清单。",
    },
    {
      id: "diagram-or-structure",
      description: "若出现流程图或结构图，能帮助理解组件调用关系。",
    },
    {
      id: "sections-present",
      description: "解释呈现概览、关键概念、如何运作、文件位置这类分节。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/how/SKILL.md",
    regression:
      "guards how's subsystem explanation: a working mental model with key concepts, a step-by-step runtime flow citing real files and symbols, where things live, and gotchas.",
  },
};
