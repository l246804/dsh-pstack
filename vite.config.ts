/**
 * Build orchestration, as a task graph rather than a shell chain.
 *
 * Four steps produce one output tree, and two of them are independent:
 *
 * ```
 * build:runtime ──> build:port ──┐
 *                                ├──> build:copy ──> build
 * build:bundle ──────────────────┘
 * ```
 *
 * `build:runtime` reads `pstack/runtime/` and writes `.build/runtime/`. `build:bundle`
 * reads `src/` and writes `dist/*.mjs`. Neither reads the other's output, so they run
 * beside each other; the dependency edge, not a `&&`, is what orders the rest.
 *
 * `build:port` writes `pstack/pstack/` and needs the runtime build, because the built
 * artifacts are files of that tree. `build:copy` then assembles `dist/` from the generated
 * tree and the two hand-written skill trees, and it runs after the bundle so `clean: true`
 * cannot delete what it copied.
 *
 * The reason this lives in `run.tasks` and not in `package.json` scripts is that the two
 * do not mix: a name defined in both is an error, and a task graph expressed as `&&` loses
 * the parallelism between `build:runtime` and `build:bundle` while making a failure read
 * as one long chain instead of one named step.
 */

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      subagent: "src/subagent.ts",
      history: "src/history.ts",
      script: "src/script.ts",
    },
    dts: {
      generator: "tsgo",
    },
    format: ["esm"],
    sourcemap: true,
    clean: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
  run: {
    tasks: {
      // Independent: reads pstack/runtime/ and writes .build/runtime/.
      "build:runtime": {
        command: "node pstack/scripts/build-runtime.ts",
        // The build must always run: a cached success would let a stale artifact survive
        // an edited source, and every later step trusts this one's output.
        cache: false,
      },
      // Independent: reads src/ and writes dist/*.mjs.
      "build:bundle": {
        command: "vp pack",
        cache: false,
      },
      // Needs the artifacts, because they are files of the tree it writes.
      "build:port": {
        command: "node pstack/scripts/generate-pstack-harness-tree.ts",
        dependsOn: ["build:runtime"],
        cache: false,
      },
      // Last of the copying steps, and after the bundle so `clean` cannot undo it.
      "build:copy": {
        command: "node pstack/scripts/copy-to-dist.ts",
        dependsOn: ["build:port", "build:bundle"],
        cache: false,
      },
      build: {
        command: "vp run build:copy",
        dependsOn: ["build:copy"],
        cache: false,
      },
      // The checks read `dist/`, so they build it first rather than reporting every shipped
      // path as missing. Four gates, each answering a different question: does the generated
      // tree still match the prose, can the shipped scripts run with nothing installed, is a
      // vendored file still the bytes it claims, and does the type checker agree.
      // Every gate is its own task, so a failure names which one broke rather than arriving at
      // the end of one long chain. The edges order them; the command reports the tally, because
      // a task without a command is not a valid definition.
      check: {
        command: "node -e \"console.log(\x27all gates passed\x27)\"",
        dependsOn: ["check:pstack-docs", "check:scripts", "check:skills-ext", "typecheck", "test"],
        cache: false,
      },
      "check:skills-ext": {
        command: "node pstack/scripts/sync-skills-ext.ts",
        cache: false,
      },
      // The type checker reads the sources, not the generated tree, so it needs no build.
      typecheck: {
        command: "node_modules/.bin/tsc --noEmit",
        cache: false,
      },
      "check:pstack-docs": {
        command: "node pstack/scripts/check-pstack-docs.ts",
        dependsOn: ["build:copy"],
        cache: false,
      },
      test: {
        command: "vp test",
        dependsOn: ["build:copy"],
        cache: false,
      },
      // The shipped artifacts must be runnable with nothing installed beside them.
      "check:scripts": {
        command: "node pstack/scripts/check-shipped-scripts.ts",
        dependsOn: ["build:copy"],
        cache: false,
      },
    },
  },
  lint: {
    // The generated tree is upstream text plus this repository's rendering of it. Linting it
    // would report formatting the generator produces by design, so it is out of scope; the
    // sources that feed it are in scope and are listed in tsconfig.
    ignorePatterns: ["upstream/**", "pstack/pstack/**", "dist/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["upstream/**", "pstack/pstack/**", "dist/**", "pstack/runtime/fork/**"],
  },
});
