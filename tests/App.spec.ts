import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "../src/App.vue";
import { useSessions } from "../src/session/useSessions";
import { useShell } from "../src/shell/useShell";

describe("App", () => {
  beforeEach(() => {
    useSessions().reset();
    useShell().reset();
  });

  it("composes the four shell regions", () => {
    const wrapper = mount(App);
    // TopBar
    expect(wrapper.text()).toContain("Workbench");
    // ExperimentRail
    expect(wrapper.text()).toContain("The Gatekeeper");
    expect(wrapper.text()).toContain("The Horadrim");
    // SessionCanvas empty state
    expect(wrapper.text()).toContain("Tools racked. Click an experiment to start a session.");
    // CommandBar
    expect(wrapper.find("footer input").attributes("placeholder")).toBe("Direct the laboratory…");
  });

  it("clicking an experiment in the rail focuses it on the canvas", async () => {
    const wrapper = mount(App);
    const railButtons = wrapper.findAll("aside button");
    await railButtons[2].trigger("click");
    expect(wrapper.text()).toContain("The Crucible");
    expect(wrapper.text()).toContain("Vise tightening… booting The Crucible.");
  });
});
