import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createScope } from "@deepseek-ai/dsh-scope";
import TypertRegistry from "@deepseek-ai/dsh-typert-registry";
import PstackHomeService from "../../src/index.ts";
import ToolsService from "@deepseek-ai/dsh-tools";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PotetoModeService } from "../../src/poteto-toggle.ts";
import type { PotetoMaintenanceService } from "../../src/poteto/maintenance-service.ts";

afterEach(() => vi.unstubAllEnvs());

describe("Poteto service lifecycle", () => {
  it("restores native tools when the plugin unloads and can restrict them after reloading", async () => {
    mkdirSync(".tmp", { recursive: true });
    const home = mkdtempSync(join(".tmp", "poteto-lifecycle-"));
    vi.stubEnv("DSH_HOME", home);
    const ctx = new Context();
    const host = ctx.plugin(() => {});
    await host.await();
    const hostCtx = host.ctx;
    try {
      hostCtx.provide("systemPrompt", { tools: () => () => {}, section: () => () => {} });
      new ToolsService(hostCtx);
      for (const name of ["subagent", "subagent_fork", "workflow"]) {
        hostCtx.tools.register({
          name,
          description: "Lifecycle fixture",
          parameters: { type: "object", properties: {} },
          output: { schema: { type: "object" }, render: () => [] },
          execute: async () => ({}),
        });
      }
      const agent = { session: { id: "lifecycle-session", header: {} } } as Agent;
      const scope = createScope(hostCtx, agent);
      Object.assign(agent, { ctx: scope.ctx });
      hostCtx.provide("agents", { list: () => [agent], get: () => agent });
      hostCtx.provide("skills", {
        get: async () => ({ name: "poteto-mode", provider: "fixture", content: "Workflow" }),
      });
      hostCtx.provide("sessionPersistence", { list: async () => [] });
      hostCtx.provide("sessionProjections", { register: async () => () => {} });
      let enabled = true;
      hostCtx.provide("storageDomain", {
        open: async () => ({
          table: () => ({
            get: () => ({ enabled }),
            put: async (_id: string, record: { enabled: boolean }) => {
              enabled = record.enabled;
            },
          }),
          close: async () => {},
        }),
      });
      const registry = hostCtx.plugin(TypertRegistry);
      await registry.await();
      await hostCtx.plugin(PstackHomeService).await();
      expect(hostCtx.get("typert")!.getPackage("dsh-pstack", "host")).toBeDefined();
      const visible = (): string[] =>
        ["subagent", "subagent_fork", "workflow"].filter((name) =>
          agent.ctx.tools.get(name, agent),
        );
      expect(visible()).toEqual(["subagent", "subagent_fork", "workflow"]);
      for (let reload = 0; reload < 2; reload += 1) {
        const plugin = hostCtx.plugin(PotetoModeService);
        await plugin.await();
        const service: PotetoModeService = hostCtx.get("pstackPotetoMode");
        const maintenance = hostCtx.get("pstackPotetoMaintenance") as PotetoMaintenanceService;
        expect(await maintenance.scanLegacySessions()).toEqual({ sessions: [], failures: [] });
        expect(visible()).toEqual(["workflow"]);
        await service.setEnabled(agent.session.id, false);
        expect(visible()).toEqual(["subagent", "subagent_fork", "workflow"]);
        await service.setEnabled(agent.session.id, true);
        expect(visible()).toEqual(["workflow"]);
        await plugin.dispose();
        expect(hostCtx.get("pstackPotetoMaintenance")).toBeUndefined();
        expect(visible()).toEqual(["subagent", "subagent_fork", "workflow"]);
      }
      await scope.dispose();
    } finally {
      await host.dispose();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
