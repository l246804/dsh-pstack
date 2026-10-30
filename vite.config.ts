import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      entry: ["./src/*.ts"],
      dts: {
        generator: "tsgo",
      },
      copy: [
        "pstack/dist/pstack",
        { from: "skills/authored", to: "dist/skills" },
        { from: "skills/.agents/skills", to: "dist/skills", rename: "vendored" },
      ],
      exports: {
        customExports: {
          "./client": "./dist/client.mjs",
          "./locale/*.json": "./locale/*.json",
        },
      },
    },
    {
      name: "dsh-pstack/client",
      cwd: ".",
      entry: ["./src/client/index.ts"],
      outDir: "dist",
      format: "cjs",
      platform: "browser",
      dts: false,
      clean: false,
      sourcemap: true,
      exports: false,
      deps: {
        neverBundle: [
          "react",
          "react/jsx-runtime",
          "react-dom",
          "react-dom/client",
          "@deepseek-ai/cordis",
          "zod",
          "@tanstack/react-virtual",
          "@deepseek-ai/dsh-client-store",
          "@deepseek-ai/dsh-client-ui-slots",
          "@deepseek-ai/dsh-client-ui-primitives",
          "@deepseek-ai/dsh-client-ui-dockkit",
        ],
      },
      outputOptions: {
        entryFileNames: "client.mjs",
        banner: 'window.__ModuleLoader__.load({ id: "dsh-pstack", factory: (require) => {',
        footer: "return module.exports; } });",
        intro: "var module = { exports: {} }; var exports = module.exports;",
      },
    },
  ],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  run: {
    tasks: {
      dev: {
        command: "vp pack --watch",
        dependsOn: ["@internal/pstack#build"],
      },
      build: {
        command: "vp pack",
        dependsOn: ["@internal/pstack#build"],
      },
      playground: {
        command: "node playground/start.mjs",
      },
      "playground:reset": {
        command: "node playground/start.mjs --reset",
      },
      "playground:reinstall": {
        command: "node playground/start.mjs --reinstall",
      },
    },
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ["upstream", "**/*.md", "pstack/pstack", "pstack/runtime"],
  },
  fmt: {
    ignorePatterns: ["upstream", "**/*.md", "pstack/pstack", "pstack/runtime"],
  },
  staged: {
    "*": "vp check --fix",
  },
});
