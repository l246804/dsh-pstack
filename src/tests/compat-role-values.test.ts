import { describe, expect, it } from "vite-plus/test";
import { isRetiredRoleKey, normalizeBudgetValue } from "../compat/role-values.ts";

describe("legacy role values", () => {
  it("maps retired budgets while preserving unknown labels", () => {
    expect(normalizeBudgetValue("unlimited (max)")).toBe("large (xhigh)");
    expect(normalizeBudgetValue("large (xhigh)")).toBe("large (xhigh)");
    expect(normalizeBudgetValue("custom budget")).toBe("custom budget");
  });
  it("recognizes retired roles without removing current roles", () => {
    expect(isRetiredRoleKey(" Hardest Tasks: ")).toBe(true);
    expect(isRetiredRoleKey("bug-fix")).toBe(false);
  });
});
