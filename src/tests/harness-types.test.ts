import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

interface Manifest {
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly dsh?: { readonly client?: { readonly inject?: readonly string[] } };
}

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as Manifest;
const config = readFileSync("vite.config.ts", "utf8");
const client = readFileSync("src/client/index.ts", "utf8");

describe("Harness contract ownership", () => {
  it("keeps official type-only packages out of runtime dependency and assembly declarations", () => {
    for (const name of [
      "@deepseek-ai/dsh-api-remotes",
      "@deepseek-ai/dsh-plugin-manager",
      "@deepseek-ai/dsh-settings",
    ]) {
      expect(manifest.devDependencies?.[name]).toBe("catalog:types");
      expect(manifest.dependencies?.[name]).toBeUndefined();
      expect(manifest.peerDependencies?.[name]).toBeUndefined();
      expect(manifest.dsh?.client?.inject).not.toContain(name);
    }
  });

  it("keeps DSH runtime packages external for both Host and Client bundles", () => {
    expect(config).toContain("const dshProvided = /^@deepseek-ai\\//;");
    expect((config.match(/neverBundle/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("declares DSH dependencies the way official plugins do", () => {
    for (const name of [
      "@deepseek-ai/cordis",
      "@deepseek-ai/cordis-plugin-loader",
      "@deepseek-ai/dsh-sandbox-policy",
      "@deepseek-ai/dsh-typert-protocol",
    ]) {
      expect(manifest.peerDependencies?.[name]).toBe("catalog:runtime");
    }
    expect(manifest.dependencies?.["@deepseek-ai/schemastery"]).toBe("catalog:runtime");
    expect(manifest.peerDependencies?.["react"]).toBeUndefined();
    expect(manifest.dependencies?.["react"]).toBeUndefined();
  });

  it("uses the shared official Remote assembly and its plugin-manager namespace", () => {
    expect(client).toContain('from "@deepseek-ai/dsh-api-remotes/client"');
    expect(client).toContain("scope.remote.pluginManager");
    expect(client).not.toContain("interface Result<");
    expect(client).not.toContain("interface PluginManagerNamespace");
  });
});
