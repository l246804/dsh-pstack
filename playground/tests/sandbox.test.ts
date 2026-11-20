import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { ProviderPlan } from "../runner/config/provider.ts";
import { imageTag } from "../runner/container/image.ts";
import { containerSpec, dockerRunArgs } from "../runner/container/spec.ts";
import type { WorkerPaths } from "../runner/worker/worker.ts";

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
    containerHome: "/dsh/home",
    containerWorkspace: "/dsh/workspace",
    containerNative: "/dsh/native",
    containerTmp: "/dsh/tmp",
    containerRuntime: "/dsh/runtime",
  };
}

const plan: ProviderPlan = {
  routes: [],
  providers: {},
  apiKeyEnv: "TEST_PROVIDER_KEY",
  apiKey: "secret-value",
  secrets: ["secret-value"],
  main: { provider: "provider-a", model: "model-a", effort: "low", name: "model-a" },
};

describe("docker container spec", () => {
  it("mounts only the worker roots and never the repository", () => {
    const paths = workerPaths();
    mkdirSync(paths.home, { recursive: true });
    mkdirSync(paths.nativeMount, { recursive: true });
    const spec = containerSpec({
      paths,
      plan,
      image: "dsh-playground:test",
      networkMode: "bridge",
    });
    expect(spec.mounts).toEqual([
      { source: paths.workspaceRoot, target: paths.containerWorkspace, readonly: false },
      { source: paths.home, target: paths.containerHome, readonly: false },
      { source: join(paths.isolatedRoot, "tmp"), target: paths.containerTmp, readonly: false },
      {
        source: join(paths.isolatedRoot, "xdg-runtime"),
        target: paths.containerRuntime,
        readonly: false,
      },
      { source: paths.nativeMount, target: paths.containerNative, readonly: true },
    ]);
    expect(JSON.stringify(spec)).not.toContain("dsh-pstack");
  });

  it("passes the provider key and strips host credentials", () => {
    const paths = workerPaths();
    mkdirSync(paths.home, { recursive: true });
    const spec = containerSpec({
      paths,
      plan,
      image: "dsh-playground:test",
      networkMode: "bridge",
    });
    expect(spec.env.TEST_PROVIDER_KEY).toBe("secret-value");
    expect(spec.env.DSH_HOME).toBe(paths.containerHome);
    expect(spec.env.HOME).toBe(paths.containerHome);
    expect(spec.env).not.toHaveProperty("GITHUB_TOKEN");
    expect(spec.env).not.toHaveProperty("GH_TOKEN");
  });

  it("builds a hardened docker run command with a loopback publish", () => {
    const paths = workerPaths();
    mkdirSync(paths.home, { recursive: true });
    const args = dockerRunArgs(
      containerSpec({
        paths,
        plan,
        image: "dsh-playground:test",
        networkMode: "bridge",
        hostPort: 49152,
      }),
    );
    expect(args).toContain("--read-only");
    expect(args).toContain("host.docker.internal:host-gateway");
    expect(args).toContain("--cap-drop");
    expect(args).toContain("no-new-privileges");
    expect(args).toContain("127.0.0.1:49152:8080");
    expect(args.at(-1)).toBe("dsh-playground:test");
    const hostArgs = dockerRunArgs(
      containerSpec({
        paths,
        plan,
        image: "dsh-playground:test",
        networkMode: "host",
        hostPort: 49152,
      }),
    );
    expect(hostArgs).toContain("--network");
    expect(hostArgs).toContain("host");
    expect(hostArgs).not.toContain("--publish");
  });

  it("uses the dsh version and host architecture in the image tag", () => {
    expect(imageTag("0.2.2-rc.4", "arm64")).toBe("dsh-playground:0.2.2-rc.4-arm64");
  });
});
