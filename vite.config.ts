import { readFileSync } from "node:fs";

import { defineConfig } from "vite-plus";

/** The client bundle registers this sheet as module metadata; the config loader cannot import CSS. */
const pstackCss = readFileSync(new URL("./src/client/lib/styles.css", import.meta.url), "utf8");

/** DSH provides its own runtime packages; never bundle them. */
const dshProvided = /^@deepseek-ai\//;

/** Client bundle registration: the module metadata carries the stylesheet the renderer installs. */
const clientBanner = `window.__ModuleLoader__.load({
	id: "dsh-pstack",
	meta: () => ({ stylesheets: { "src/client/lib/styles.css": { text: () => ${JSON.stringify(pstackCss)} } } }),
	factory: (require) => {`;

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
        // Copy entries run concurrently; only the adapter writes this harness file.
        {
          from: ["native/pstack/**/*", "!native/pstack/docs/harness/dsh.md"],
          to: "dist",
          flatten: false,
        },
        { from: "src/dsh.md", to: "dist/pstack/docs/harness" },
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
        banner: clientBanner,
        footer: "return module.exports; } });",
        intro: "var module = { exports: {} }; var exports = module.exports;",
      },
    },
  ],
  test: {
    include: [
      "tests/**/*.test.{ts,tsx,mjs}",
      "native/tests/**/*.test.{ts,tsx,mjs}",
      "src/tests/**/*.test.{ts,tsx,mjs}",
      "playground/tests/**/*.test.{ts,tsx,mjs}",
    ],
  },
  run: {
    tasks: {
      // Repository level: build, static checks, release consistency.
      build: {
        command: "vp pack",
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
      "playground:image": {
        command: "vpx playground/runner/cli/build-image.ts",
        cache: false,
      },
      "playground:prepare": {
        command: "vpx playground/runner/cli/prepare.ts",
        cache: false,
      },
      "playground:open": {
        command: "vpx playground/runner/cli/prepare.ts --variant adapted --environment preview",
        cache: false,
        dependsOn: ["build", "playground:close"],
      },
      "playground:close": {
        command: "vpx playground/runner/cli/stop.ts --variant adapted --environment preview",
        cache: false,
      },
      "playground:reset": {
        command:
          "vpx playground/runner/cli/prepare.ts --variant adapted --environment preview --reset",
        cache: false,
        dependsOn: ["build"],
      },
      "playground:ui:open": {
        command:
          "vpx playground/runner/cli/prepare.ts --variant adapted --environment ui && vpx playground/runner/cli/ui-browser.ts open",
        cache: false,
        dependsOn: ["build", "playground:ui:close"],
      },
      "playground:ui:browser": {
        command: "vpx playground/runner/cli/ui-browser.ts",
        cache: false,
      },
      "playground:ui:close": {
        command: "vpx playground/runner/cli/stop.ts --variant adapted --environment ui",
        cache: false,
      },
      "playground:ui:reset": {
        command:
          "vpx playground/runner/cli/prepare.ts --variant adapted --environment ui --reset && vpx playground/runner/cli/ui-browser.ts open",
        cache: false,
        dependsOn: ["build", "playground:ui:close"],
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
      "playground:session-tail": {
        command: "vpx playground/runner/cli/session-tail.ts",
        cache: false,
      },
      "playground:stop-task": {
        command: "vpx playground/runner/cli/stop-task.ts",
        cache: false,
      },
      "playground:run": {
        command: "vpx playground/runner/cli/run-scenario.ts",
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
