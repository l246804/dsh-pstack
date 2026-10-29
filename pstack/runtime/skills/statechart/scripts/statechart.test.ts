import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspect } from "node:util";

import { checkView, json } from "./frontends/view.ts";
import { readConfig } from "./frontends/config.ts";
import { readMessages } from "./frontends/messages.ts";
import { readChecks } from "./frontends/spec.ts";
import { plainText } from "./backends/plain-text.ts";
import { parseValue } from "./frontends/value.ts";
import { type CheckResult, type Graph, key, type Rule, show } from "./ir.ts";
import { compile } from "./pipeline.ts";

const invariant: Rule = { kind: "invariant", name: "Inv" };

function graphWithBreak(): Graph {
  return {
    states: new Map([
      ["s0", { vars: { x: 0 }, start: true, breaks: [] }],
      ["s1", { vars: { x: 1 }, start: false, breaks: [invariant] }],
    ]),
    steps: [{ from: "s0", to: "s1", action: "Next" }],
  };
}

function resultWithBreak(): CheckResult {
  return {
    spec: {
      module: "Test",
      folder: "/tmp",
      variables: ["x"],
      invariants: ["Inv"],
      properties: [],
      deadlock: false,
      written: [],
    },
    graph: graphWithBreak(),
    paths: undefined,
    rules: [{ rule: invariant, outcome: "broken", messages: ["Inv is violated"] }],
    properties: [],
    exit: 1,
    stop: undefined,
    drawing: undefined,
    states: { distinct: 2, initial: 1, complete: true, cut: false },
    messages: ["TLC finished"],
  };
}

test("reads the TLA+ value grammar the skill documents", () => {
  assert.deepEqual(json(parseValue('<<1, "a", <<>>>>')), { 1: 1, 2: "a", 3: {} });
  assert.deepEqual(json(parseValue("{r1, -2}")), ["r1", -2]);
  assert.deepEqual(json(parseValue("-1..2")), [-1, 0, 1, 2]);
  assert.deepEqual(json(parseValue('[ok |-> TRUE, msg |-> "say \\"hi\\""]')), {
    ok: true,
    msg: 'say "hi"',
  });
  assert.throws(() => parseValue("1.."), /cannot read TLA\+ value/);
});

test("prints each value in TLA+ and compares by TLA+ equality", () => {
  assert.equal(show(parseValue("<<0>>")), "<<0>>");
  assert.equal(show(parseValue("[a |-> 1]")), "[a |-> 1]");
  assert.equal(key(parseValue("1..3")), key(parseValue("{3, 1, 2, 2}")));
  assert.notEqual(key(parseValue('"A"')), key(parseValue("A")));
});

test("reads a TLC config into the checks the report names", () => {
  const config = readConfig({
    file: "Min.cfg",
    text: "INIT Init\nNEXT Next\nINVARIANT Inv\nPROPERTY Live\n",
  });
  assert.equal(config.init, "Init");
  assert.equal(config.next, "Next");
  assert.deepEqual(config.invariants, ["Inv"]);
  assert.deepEqual(config.properties, ["Live"]);
  const checks = readChecks({ configFile: "Min.cfg", config });
  assert.equal(checks.deadlock, true);
});

test("prints TLC's -tool messages as plain text", () => {
  const text = [
    "@!@!@STARTMSG 2262:0 @!@!@",
    "TLC2 Version 2.19",
    "@!@!@ENDMSG 2262 @!@!@",
  ].join("\n");
  assert.equal([...plainText(readMessages(text))].join(""), "TLC2 Version 2.19\n");
});

test("compiles a broken rule into report.md, chart.mmd, and tlc.out", () => {
  const compiled = compile(resultWithBreak(), checkView({}, inspect));
  assert.equal(compiled.exit, 1);
  const report = compiled.report;
  assert.match(report, /Inv/);
  assert.match(report, /Next/);
  const chart = [...(compiled.files.get("chart.mmd") ?? [])].join("");
  assert.match(chart, /stateDiagram/);
  assert.match(chart, /Next/);
  assert.ok(compiled.files.has("report.md"));
  assert.ok(compiled.files.has("tlc.out"));
});

test("the CLI rejects a missing spec with usage and exit 2", () => {
  const here = import.meta.dirname;
  const entry = join(here, import.meta.url.endsWith(".ts") ? "statechart.ts" : "statechart.mjs");
  const result = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Give one SPEC\.tla\./);
  assert.match(result.stderr, /Usage: statechart SPEC\.tla/);
});

test("the CLI runs the worker against TLC and writes the report, chart, and tlc.out", () => {
  const root = mkdtempSync(join(tmpdir(), "statechart-worker-"));
  try {
    const caseDir = join(root, "case");
    mkdirSync(caseDir);
    writeFileSync(join(caseDir, "Smoke.tla"), "---- MODULE Smoke ----\n====\n");
    writeFileSync(join(caseDir, "Smoke.cfg"), "INIT Init\nNEXT Next\n");

    const fakeJava = join(root, "fake-java.mjs");
    writeFileSync(
      fakeJava,
      String.raw`#!/usr/bin/env node
import fs from "node:fs";
const args = process.argv.slice(2);
if (args.includes("tla2sany.xml.XMLExporter")) {
  process.stdout.write('<modules><context><entry><UID>1</UID><OpDeclNode><uniquename>x</uniquename><kind>3</kind></OpDeclNode></entry><entry><UID>2</UID><ModuleNode><uniquename>Smoke</uniquename><OpDeclNodeRef><UID>1</UID></OpDeclNodeRef></ModuleNode></entry></context><RootModule>Smoke</RootModule></modules>');
  process.exit(0);
}
const dump = args.indexOf("-dump");
if (dump !== -1) {
  fs.writeFileSync(args[dump + 2] + ".dot", [
    "strict digraph DiskGraph {",
    '1 [label="/\\\\ x = 0",style = filled]',
    '2 [label="/\\\\ x = 1"]',
    '1 -> 2 [label="Next"];',
    "}",
  ].join("\n"));
}
process.stdout.write("@!@!@STARTMSG 2199:0 @!@!@\n2 distinct states found.\n@!@!@ENDMSG 2199 @!@!@\n");
process.exit(0);
`,
    );
    chmodSync(fakeJava, 0o755);

    const here = import.meta.dirname;
    const entry = join(here, import.meta.url.endsWith(".ts") ? "statechart.ts" : "statechart.mjs");
    const out = join(root, "out");
    const result = spawnSync(process.execPath, [entry, join(caseDir, "Smoke.tla"), "--out", out], {
      encoding: "utf8",
      env: { ...process.env, JAVA: fakeJava, TLA2TOOLS: "tla2tools.jar" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(out).sort(), ["chart.mmd", "report.md", "tlc.out"]);
    assert.match(readFileSync(join(out, "report.md"), "utf8"), /# Smoke[\s\S]*NoDeadlock/);
    assert.match(readFileSync(join(out, "chart.mmd"), "utf8"), /stateDiagram/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
