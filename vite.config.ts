import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      subagent: "src/subagent.ts",
    },
    dts: {
      generator: "tsgo",
    },
    format: ["esm"],
    sourcemap: true,
    clean: true,
    copy: ["cordis.patch.yml", "README.md", "README.zh.md", "LICENSE"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: ["upstream/**", "assets/**", "dist/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["upstream/**", "assets/**", "dist/**"],
  },
});
