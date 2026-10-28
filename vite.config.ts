import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["./src/*.ts"],
    dts: {
      generator: "tsgo",
    },
    copy: [
      "pstack/dist/pstack",
      { from: "skills/authored", to: "dist/skills" },
      { from: "skills/vendored", to: "dist/skills" },
    ],
    exports: true,
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
