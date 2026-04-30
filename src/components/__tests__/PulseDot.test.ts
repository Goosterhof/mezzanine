import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PulseDot from "@/components/PulseDot.vue";
import type { SessionState } from "@/types/workbench";

// A single sanity test that the test pipeline exists. The Workbench's real
// behaviour (live pty I/O, Tauri event listening, command bar prefix
// routing) is integration-tested in Phase 1C/2; the unit-test layer's job
// for Phase 1A is "the harness compiles and runs."

describe("PulseDot", () => {
  const cases: Array<{ state: SessionState; classFragment: string }> = [
    { state: "idle", classFragment: "bg-wb-pulse-idle" },
    { state: "awaiting", classFragment: "bg-wb-pulse-awaiting" },
    { state: "working", classFragment: "bg-wb-pulse-working" },
    { state: "completed-unseen", classFragment: "bg-wb-pulse-flash" },
    { state: "crashed", classFragment: "bg-wb-pulse-crashed" },
  ];

  it.each(cases)(
    "renders the $state state with the correct dot class",
    ({ state, classFragment }) => {
      const wrapper = mount(PulseDot, { props: { state } });
      expect(wrapper.attributes("class")).toContain(classFragment);
    },
  );
});
