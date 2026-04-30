import { defineStore } from "pinia";
import { ref } from "vue";
import type { ExperimentId, SessionState } from "@/types/workbench";
import { EXPERIMENTS } from "@/types/workbench";

/**
 * The session store — Pinia mirror of the Rust PtyManager.
 *
 * Phase 1A scaffold: the store holds session state and a 200-line ring
 * buffer per experiment, but no live pty wiring exists yet. Phase 1C
 * subscribes to Tauri events from the Rust side and pushes output into
 * the ring buffers.
 */
function emptyStateMap(): Record<ExperimentId, SessionState> {
  const out = {} as Record<ExperimentId, SessionState>;
  for (const exp of EXPERIMENTS) {
    out[exp.id] = "idle";
  }
  return out;
}

function emptyBufferMap(): Record<ExperimentId, string[]> {
  const out = {} as Record<ExperimentId, string[]>;
  for (const exp of EXPERIMENTS) {
    out[exp.id] = [];
  }
  return out;
}

export const useSessionsStore = defineStore("sessions", () => {
  const states = ref<Record<ExperimentId, SessionState>>(emptyStateMap());

  /** Last 200 lines of pty output per experiment. Ring-buffer semantics. */
  const buffers = ref<Record<ExperimentId, string[]>>(emptyBufferMap());

  /** LRU recency — most-recently-viewed last. Phase 1C uses this for eviction. */
  const recency = ref<ExperimentId[]>([]);

  function setState(id: ExperimentId, state: SessionState): void {
    states.value[id] = state;
  }

  function appendOutput(id: ExperimentId, line: string): void {
    const buf = buffers.value[id];
    buf.push(line);
    if (buf.length > 200) {
      buf.splice(0, buf.length - 200);
    }
  }

  function touch(id: ExperimentId): void {
    const idx = recency.value.indexOf(id);
    if (idx !== -1) {
      recency.value.splice(idx, 1);
    }
    recency.value.push(id);
  }

  return {
    states,
    buffers,
    recency,
    setState,
    appendOutput,
    touch,
  };
});
