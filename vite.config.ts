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
        // The shipped tree is the native baseline tree; the build task then stamps the
        // plugin-aware adapter over the baseline answer (pack copy targets must not nest).
        { from: "native/pstack", to: "dist", rename: "pstack" },
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
      // Repository level: build, static checks, release consistency.
      build: {
        command: "vp pack && cp src/dsh.md dist/pstack/docs/harness/dsh.md",
        dependsOn: ["native:generate"],
      },
      typecheck: {
        command: "tsc --noEmit -p tsconfig.json",
      },
      "compatibility:check": {
        command: "vpx scripts/release-compatibility.ts --check",
        cache: false,
      },

      // native: pinned upstream and the generated baseline tree.
      "native:fetch": {
        command: "vpx native/scripts/fetch-upstream.ts",
        cache: false,
      },
      "native:fetch:latest": {
        command: "vpx native/scripts/fetch-upstream.ts --latest",
        cache: false,
      },
      "native:generate": {
        command: "vpx native/scripts/fetch-upstream.ts && vpx native/scripts/generate-pstack.ts",
        cache: false,
      },
      "native:generate:check": {
        command:
          "vpx native/scripts/fetch-upstream.ts && vpx native/scripts/generate-pstack.ts --check",
        cache: false,
      },

      // playground: real-session validation harness.
      "playground:typecheck": {
        command: "tsc --noEmit -p playground/tsconfig.json",
      },
      "playground:doctor": {
        command: "vpx playground/runner/cli/doctor.ts",
        cache: false,
      },
      "playground:prepare": {
        command: "vpx playground/runner/cli/prepare.ts",
        cache: false,
      },
      "playground:open": {
        command:
          "vpx playground/runner/cli/prepare.ts --treatment adapted --environment preview --workers 1",
        cache: false,
        dependsOn: ["build", "playground:close"],
      },
      "playground:close": {
        command: "vpx playground/runner/cli/stop.ts --treatment adapted --environment preview",
        cache: false,
      },
      "playground:reset": {
        command:
          "vpx playground/runner/cli/prepare.ts --treatment adapted --environment preview --workers 1 --reset",
        cache: false,
      },
      "playground:bootstrap": {
        command: "vpx playground/runner/cli/bootstrap.ts",
        cache: false,
      },
      "playground:stop": {
        command: "vpx playground/runner/cli/stop.ts",
        cache: false,
      },
      "playground:status": {
        command: "vpx playground/runner/cli/status.ts",
        cache: false,
      },
      "playground:stop-task": {
        command: "vpx playground/runner/cli/stop-task.ts",
        cache: false,
      },
      "playground:redact": {
        command: "vpx playground/scripts/redact.ts",
        cache: false,
      },
      "playground:run": {
        command: "vpx playground/runner/cli/run-case.ts",
        cache: false,
      },
      "playground:run-batch": {
        command: "vpx playground/runner/cli/run-batch.ts",
        cache: false,
      },
      "playground:collect": {
        command: "vpx playground/runner/cli/collect.ts",
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
      "playground:gap-lock": {
        command: "vpx playground/scripts/gap-lock.ts",
        cache: false,
      },
      "playground:compare": {
        command: "vpx playground/scripts/compare.ts",
        cache: false,
      },
      "playground:browser": {
        command: "vpx playground/runner/cli/browser.ts",
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
    ignorePatterns: ["native/upstream", "native/pstack", "**/*.md"],
  },
  fmt: {
    ignorePatterns: ["native/upstream", "native/pstack", "**/*.md"],
  },
  staged: {
    "*": "vp check --fix",
  },
});
