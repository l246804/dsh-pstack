import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    root: ".",
    entry: [
      "./runtime/**/*.ts",
      "./runtime/**/*.mjs",
      // Upstream ships this entry with no extension, so no glob above matches it.
      "./runtime/skills/poteto-mode/scripts/watch-pr/watch-pr",
    ],
    dts: false,
    unbundle: true,
  },
  run: {
    tasks: {
      "build:runtime": {
        command: "vp pack",
      },
      generate: {
        command: "node scripts/generate-pstack-harness-tree.mjs",
      },
      "generate:check": {
        command: "node scripts/generate-pstack-harness-tree.mjs --check",
      },
      "copy:pstack": {
        command: "node scripts/copy-pstack.mjs",
        dependsOn: ["generate", "build:runtime"],
      },
      "replace:scripts": {
        command: "node scripts/replace-scripts.mjs",
        dependsOn: ["build:runtime", "copy:pstack"],
      },
      build: {
        command: "vp run replace:scripts",
      },
      "check:harness-doc": {
        command: "node scripts/check-harness-doc.mjs",
        dependsOn: ["generate:check"],
      },
      check: {
        command: "vp run check:harness-doc",
      },
      test: {
        command: "node --test 'dist/runtime/**/*.test.mjs'",
        dependsOn: ["build:runtime"],
      },
    },
  },
});
