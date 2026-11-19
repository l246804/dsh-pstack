import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { ProviderPlan } from "../playground/runner/lib/env.ts";
import { imageTag } from "../playground/runner/lib/sandbox/image.ts";
import { containerSpec, dockerRunArgs } from "../playground/runner/lib/sandbox/spec.ts";
import type { WorkerPaths } from "../playground/runner/lib/worker.ts";

const temporary = mkdtempSync(join(tmpdir(), "dsh-sandbox-"));

afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function workerPaths(): WorkerPaths {
  const root = join(temporary, "worker");
  const isolatedRoot = join(temporary, "isolated");
  return {
    index: 0,
    environmentId: "base",
    treatment: "adapted",
    root,
    isolatedRoot,
    home: join(root, "home"),
    browserDir: join(root, "browser"),
    workspaceRoot: join(isolatedRoot, "workspace"),
    nativeMount: join(isolatedRoot, "native"),
    evidenceDir: join(root, "evidence"),
    urlFile: join(root, "web-url.txt"),
    logFile: join(root, "web.log"),
    treatmentFile: join(root, "treatment.txt"),
    containerName: "dsh-playground-adapted-base-w0",
  };
}

const plan: ProviderPlan = {
  routes: [],
  providers: {},
  apiKeyEnv: "TEST_PROVIDER_KEY",
  apiKey: "secret-value",
  main: { provider: "provider-a", model: "model-a", effort: "low", name: "model-a" },
};

describe("docker container spec", () => {
  it("mounts only the worker roots and never the repository", () => {
    const paths = workerPaths();
    mkdirSync(paths.home, { recursive: true });
    mkdirSync(paths.nativeMount, { recursive: true });
    const spec = containerSpec({ paths, plan, image: "dsh-playground:test" });
    expect(spec.mounts).toEqual([
      { source: paths.isolatedRoot, target: paths.isolatedRoot, readonly: false },
      { source: paths.home, target: paths.home, readonly: false },
      { source: paths.nativeMount, target: paths.nativeMount, readonly: true },
    ]);
    expect(JSON.stringify(spec)).not.toContain("dsh-pstack");
  });

  it("passes the provider key and strips host credentials", () => {
    const paths = workerPaths();
    mkdirSync(paths.home, { recursive: true });
    const spec = containerSpec({ paths, plan, image: "dsh-playground:test" });
    expect(spec.env.TEST_PROVIDER_KEY).toBe("secret-value");
    expect(spec.env.DSH_HOME).toBe(paths.home);
    expect(spec.env.HOME).toBe(paths.home);
    expect(spec.env).not.toHaveProperty("GITHUB_TOKEN");
    expect(spec.env).not.toHaveProperty("GH_TOKEN");
  });

  it("builds a hardened docker run command with a loopback publish", () => {
    const paths = workerPaths();
    mkdirSync(paths.home, { recursive: true });
    const args = dockerRunArgs(
      containerSpec({ paths, plan, image: "dsh-playground:test", hostPort: 49152 }),
    );
    expect(args).toContain("--read-only");
    expect(args).toContain("--cap-drop");
    expect(args).toContain("no-new-privileges");
    expect(args).toContain("127.0.0.1:49152:8080");
    expect(args.at(-1)).toBe("dsh-playground:test");
  });

  it("uses the dsh version in the image tag", () => {
    expect(imageTag("0.2.2-rc.4")).toBe("dsh-playground:0.2.2-rc.4");
  });
});
