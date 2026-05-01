import { describe, it, expect } from "vitest";
import { EXPERIMENTS } from "../../src/session/types";

describe("EXPERIMENTS table", () => {
  it("lists the six experiments in left-rail order", () => {
    expect(EXPERIMENTS.map((e) => e.id)).toEqual([
      "gatekeeper",
      "war-table",
      "crucible",
      "parlour",
      "smokestacks",
      "horadrim",
    ]);
  });

  it("gives every experiment a label, codename, and WSL path", () => {
    for (const exp of EXPERIMENTS) {
      expect(exp.label).toMatch(/^The /);
      expect(exp.codename).toBeTruthy();
      expect(exp.wslRelativePath).toMatch(/^experiments\/zmuuzn-/);
    }
  });

  it("uses the experiment id as its codename", () => {
    for (const exp of EXPERIMENTS) {
      expect(exp.codename).toBe(exp.id);
    }
  });

  it("has unique experiment ids", () => {
    const ids = EXPERIMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
