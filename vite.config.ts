import { defineConfig } from "vite-plus";

/** DSH provides its own runtime packages; never bundle them. */
const dshProvided = /^@deepseek-ai\//;

export default defineConfig({
  pack: [
    {
      entry: "./src/*.ts",
      dts: {
        generator: "tsgo",
      },
      deps: {
        neverBundle: [dshProvided],
        dts: {
          neverBundle: [dshProvided],
        },
      },
      exports: {
        customExports: {
          "./locale/*.json": "./locale/*.json",
          "./client": "./dist/client.js",
        },
      },
      copy: [
        "pstack",
        { from: "skills/.agents/skills", to: "dist/skills", rename: "vendored" },
        { from: "skills/authored", to: "dist/skills", rename: "authored" },
      ],
    },
    {
      name: "dsh-pstack/client",
      cwd: ".",
      entry: ["./src/client/index.ts"],
      outDir: "dist",
      format: "cjs",
      inputOptions: { platform: "browser" },
      dts: false,
      clean: false,
      sourcemap: false,
      exports: false,
      deps: {
        neverBundle: ["react", "react/jsx-runtime", "react-dom", "react-dom/client", dshProvided],
      },
      outputOptions: {
        entryFileNames: "client.js",
        banner: 'window.__ModuleLoader__.load({ id: "dsh-pstack", factory: (require) => {',
        footer: "return module.exports; } });",
        intro: "var module = { exports: {} }; var exports = module.exports;",
      },
    },
  ],
  test: {
    include: ["tests/**/*.test.{ts,tsx,mjs}"],
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: ["generate"],
      },
      typecheck: {
        command: "tsc --noEmit -p tsconfig.json",
      },
      "playground:typecheck": {
        command: "tsc --noEmit -p playground/tsconfig.json",
      },
      generate: {
        command: "vpx scripts/generate-pstack.mjs --target port",
        cache: false,
      },
      "generate:check": {
        command: "vpx scripts/generate-pstack.mjs --target port --check",
        cache: false,
      },
      "compatibility:check": {
        command: "vpx scripts/release-compatibility.ts --check",
        cache: false,
      },
      "playground:raw-generate": {
        command: "vpx scripts/generate-pstack.mjs --target raw",
        cache: false,
      },
      "playground:doctor": {
        command: "vpx playground/scripts/doctor.ts",
        cache: false,
      },
      "playground:prepare": {
        command: "vpx playground/scripts/prepare.ts",
        cache: false,
      },
      "playground:open": {
        command:
          "vpx playground/scripts/prepare.ts --phase adapted --environment preview --workers 1",
        cache: false,
        dependsOn: ["build", "playground:close"],
      },
      "playground:close": {
        command: "vpx playground/scripts/stop.ts --phase adapted --environment preview",
        cache: false,
      },
      "playground:reset": {
        command:
          "vpx playground/scripts/prepare.ts --phase adapted --environment preview --workers 1 --reset",
        cache: false,
      },
      "playground:bootstrap": {
        command: "vpx playground/scripts/bootstrap.ts",
        cache: false,
      },
      "playground:stop": {
        command: "vpx playground/scripts/stop.ts",
        cache: false,
      },
      "playground:status": {
        command: "vpx playground/scripts/status.ts",
        cache: false,
      },
      "playground:stop-task": {
        command: "vpx playground/scripts/stop-task.ts",
        cache: false,
      },
      "playground:redact": {
        command: "vpx playground/scripts/redact.ts",
        cache: false,
      },
      "playground:run": {
        command: "vpx playground/scripts/run-case.ts",
        cache: false,
      },
      "playground:run-batch": {
        command: "vpx playground/scripts/run-batch.ts",
        cache: false,
      },
      "playground:collect": {
        command: "vpx playground/scripts/collect.ts",
        cache: false,
      },
      "playground:review": {
        command: "vpx playground/scripts/review.ts",
        cache: false,
      },
      "playground:status-table": {
        command: "vpx playground/scripts/status-table.ts",
        cache: false,
      },
      "playground:compare": {
        command: "vpx playground/scripts/compare.ts",
        cache: false,
      },
      "playground:browser": {
        command: "vpx playground/scripts/browser.ts",
        cache: false,
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
    ignorePatterns: ["upstream", "**/*.md", "pstack"],
  },
  fmt: {
    ignorePatterns: ["upstream", "**/*.md", "pstack"],
  },
  staged: {
    "*": "vp check --fix",
  },
});
