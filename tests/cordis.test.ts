import { describe, expect, it } from "vite-plus/test";
import { Context } from "@deepseek-ai/cordis";
import SkillService from "@deepseek-ai/dsh-skill";
import * as pstack from "../src/index.ts";

const ctx = new Context();
ctx.plugin(SkillService);
ctx.plugin(pstack);
await new Promise((resolve) => setTimeout(resolve, 25));

describe("pstack on a real Cordis context", () => {
  it("registers every bundled skill in the catalog", async () => {
    const skills = await ctx.skills.list();
    const pstackSkills = skills.filter((skill) => skill.provider === "pstack");
    expect(pstackSkills).toHaveLength(55);
    expect(pstackSkills.map((skill) => skill.name)).toContain("poteto-mode");
  });

  it("marks user-invocable skills correctly", async () => {
    const skills = await ctx.skills.list();
    const mode = skills.find((skill) => skill.name === "poteto-mode");
    expect(mode?.invocation).toEqual({ modelInvocable: false, userInvocable: true });

    const principle = skills.find((skill) => skill.name === "principle-prove-it-works");
    expect(principle?.invocation).toEqual({ modelInvocable: false, userInvocable: true });
  });

  it("loads a skill body without frontmatter", async () => {
    const skill = await ctx.skills.get("poteto-mode");
    expect(skill?.content).toContain("# Poteto mode");
    expect(skill?.content).toContain("DSH port of pstack");
    expect(skill?.content).not.toContain("disable-model-invocation");
  });
});
