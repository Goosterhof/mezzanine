import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ExperimentRail from "../../src/shell/ExperimentRail.vue";
import { useSessions } from "../../src/session/useSessions";
import { EXPERIMENTS } from "../../src/session/types";

describe("ExperimentRail", () => {
  beforeEach(() => {
    useSessions().reset();
  });

  it("renders one tab per experiment", () => {
    const wrapper = mount(ExperimentRail);
    const buttons = wrapper.findAll("button");
    expect(buttons).toHaveLength(EXPERIMENTS.length);
    for (const exp of EXPERIMENTS) {
      expect(wrapper.text()).toContain(exp.label);
    }
  });

  it("renders the bench header and vise footer", () => {
    const wrapper = mount(ExperimentRail);
    expect(wrapper.text()).toContain("Bench");
    expect(wrapper.text()).toContain("The Workbench");
    expect(wrapper.text()).toContain("Vise");
    expect(wrapper.text()).toContain("0 / 3 warm");
  });

  it("clicking an experiment button focuses that experiment", async () => {
    const wrapper = mount(ExperimentRail);
    await wrapper.findAll("button")[2].trigger("click");
    expect(useSessions().activeExperiment.value).toBe("crucible");
  });

  it("highlights the active experiment with wb-tab-active", async () => {
    const wrapper = mount(ExperimentRail);
    const crucibleButton = wrapper.findAll("button")[2];
    expect(crucibleButton.classes()).not.toContain("wb-tab-active");
    await crucibleButton.trigger("click");
    expect(crucibleButton.classes()).toContain("wb-tab-active");
  });

  it("only one experiment is active at a time", async () => {
    const wrapper = mount(ExperimentRail);
    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    await buttons[3].trigger("click");
    expect(buttons[0].classes()).not.toContain("wb-tab-active");
    expect(buttons[3].classes()).toContain("wb-tab-active");
  });

  it("the vise counter reflects recency length", async () => {
    const sessions = useSessions();
    sessions.touch("crucible");
    sessions.touch("parlour");
    const wrapper = mount(ExperimentRail);
    expect(wrapper.text()).toContain("2 / 3 warm");
  });
});
