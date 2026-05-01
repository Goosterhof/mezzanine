import { describe, it, expect, beforeEach } from "vitest";
import { useSessions } from "../../src/session/useSessions";
import { EXPERIMENTS } from "../../src/session/types";

describe("useSessions", () => {
  beforeEach(() => {
    useSessions().reset();
  });

  it("starts every experiment in the idle state", () => {
    const { states } = useSessions();
    for (const exp of EXPERIMENTS) {
      expect(states.value[exp.id]).toBe("idle");
    }
  });

  it("starts with empty buffers, empty recency, and no active experiment", () => {
    const { buffers, recency, activeExperiment } = useSessions();
    for (const exp of EXPERIMENTS) {
      expect(buffers.value[exp.id]).toEqual([]);
    }
    expect(recency.value).toEqual([]);
    expect(activeExperiment.value).toBeNull();
  });

  it("setState updates a single experiment without disturbing siblings", () => {
    const { states, setState } = useSessions();
    setState("crucible", "working");
    expect(states.value.crucible).toBe("working");
    expect(states.value.gatekeeper).toBe("idle");
  });

  it("appendOutput pushes lines onto the experiment's ring buffer", () => {
    const { buffers, appendOutput } = useSessions();
    appendOutput("crucible", "first");
    appendOutput("crucible", "second");
    expect(buffers.value.crucible).toEqual(["first", "second"]);
    expect(buffers.value.gatekeeper).toEqual([]);
  });

  it("appendOutput trims the buffer to the last 200 lines", () => {
    const { buffers, appendOutput } = useSessions();
    for (let i = 0; i < 250; i++) {
      appendOutput("crucible", `line ${i}`);
    }
    expect(buffers.value.crucible).toHaveLength(200);
    expect(buffers.value.crucible[0]).toBe("line 50");
    expect(buffers.value.crucible[199]).toBe("line 249");
  });

  it("touch appends to recency for first-time touches", () => {
    const { recency, touch } = useSessions();
    touch("crucible");
    touch("gatekeeper");
    expect(recency.value).toEqual(["crucible", "gatekeeper"]);
  });

  it("touch moves an already-touched experiment to the end", () => {
    const { recency, touch } = useSessions();
    touch("crucible");
    touch("gatekeeper");
    touch("crucible");
    expect(recency.value).toEqual(["gatekeeper", "crucible"]);
  });

  it("focus sets the active experiment", () => {
    const { activeExperiment, focus } = useSessions();
    focus("parlour");
    expect(activeExperiment.value).toBe("parlour");
    focus("horadrim");
    expect(activeExperiment.value).toBe("horadrim");
  });

  it("reset clears all state", () => {
    const sessions = useSessions();
    sessions.setState("crucible", "working");
    sessions.appendOutput("crucible", "hello");
    sessions.touch("crucible");
    sessions.focus("crucible");

    sessions.reset();

    expect(sessions.states.value.crucible).toBe("idle");
    expect(sessions.buffers.value.crucible).toEqual([]);
    expect(sessions.recency.value).toEqual([]);
    expect(sessions.activeExperiment.value).toBeNull();
  });

  it("returns the same singleton state across calls", () => {
    useSessions().focus("smokestacks");
    expect(useSessions().activeExperiment.value).toBe("smokestacks");
  });
});
