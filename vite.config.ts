import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ['./src/*.ts'],
    dts: {
      generator: "tsgo",
    },
    copy: [
      'pstack/dist/pstack',
      { from: 'skills/authored', to: 'dist/skills' },
      { from: 'skills/vendored', to: 'dist/skills' },
    ],
    exports: true,
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: ["@internal/pstack#build"],
      },
    },
  },
  lint: {
    ignorePatterns: ["upstream/**", "pstack/pstack/**", "pstack/dist/**", "dist/**", "pstack/runtime/**", "skills/*/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["upstream/**", "pstack/pstack/**", "pstack/dist/**", "dist/**", "pstack/runtime/**", "skills/*/**"],
  },
});
