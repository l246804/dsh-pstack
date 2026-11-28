import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readBrowserConfig, readConfig, readRuntimeConfig } from "../runner/config/config.ts";
import { runtimeSettings, setRuntimeSettings } from "../runner/config/runtime.ts";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  setRuntimeSettings(undefined);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  mkdirSync(".tmp", { recursive: true });
  const directory = mkdtempSync(resolve(".tmp/config-loading-"));
  directories.push(directory);
  const runtime = {
    scenarioTimeoutMs: 600_000,
    turnTimeoutMs: 180_000,
    subagentTimeoutMs: 600_000,
    networkMode: "host",
    workerPortBase: 8080,
    workerCapacity: { coreHeadroom: 2, memoryFraction: 0.7, memoryPerWorkerGB: 1 },
    workspaceRoot: join(directory, "workspace"),
    workersDir: join(directory, "workers"),
    dockerBin: "docker",
    dshBin: "dsh",
    vpxBin: "vpx",
    pnpmBin: "pnpm",
  };
  return { directory, runtime };
}

describe("configuration loading boundaries", () => {
  it("loads paths and browser settings without resolving unavailable model credentials", async () => {
    const { directory, runtime } = fixture();
    vi.stubEnv("PLAYGROUND_MISSING_TEST_CREDENTIAL", undefined);
    const file = join(directory, "config.json");
    writeFileSync(
      file,
      JSON.stringify({
        runtime,
        browser: { mode: "cdp", cdpUrl: "http://127.0.0.1:9222" },
        providers: {
          fixture: {
            kind: "pi-ai",
            apiKey: "${PLAYGROUND_MISSING_TEST_CREDENTIAL}",
            apiKeyEnv: "TEST_KEY",
            reasoning: "low",
            models: [{ id: "fixture" }],
          },
        },
        credentialsFile: join(directory, "missing-credentials.yaml"),
        testModel: { provider: "fixture", model: "fixture", effort: "low" },
      }),
    );
    await expect(readRuntimeConfig(file)).resolves.toEqual(runtime);
    expect(runtimeSettings().workersDir).toBe(runtime.workersDir);
    await expect(readBrowserConfig(file)).resolves.toMatchObject({ browser: { mode: "cdp" } });
    await expect(readConfig(file)).rejects.toThrow("missing-credentials.yaml");
  });

  it("defers provider discovery until execution config is requested", async () => {
    const { directory, runtime } = fixture();
    const file = join(directory, "config.mjs");
    writeFileSync(
      file,
      `export default { runtime: ${JSON.stringify(runtime)}, get providers() { throw new Error('host provider unavailable'); } };`,
    );
    await expect(readRuntimeConfig(file)).resolves.toEqual(runtime);
    await expect(readBrowserConfig(file)).resolves.toEqual({ runtime });
    await expect(readConfig(file)).rejects.toThrow("host provider unavailable");
  });

  it("still rejects invalid runtime settings for local commands", async () => {
    const { directory, runtime } = fixture();
    const file = join(directory, "config.json");
    writeFileSync(file, JSON.stringify({ runtime: { ...runtime, workerPortBase: -1 } }));
    await expect(readRuntimeConfig(file)).rejects.toThrow("runtime.workerPortBase");
  });
});
