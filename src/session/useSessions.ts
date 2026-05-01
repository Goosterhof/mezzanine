import { ref } from "vue";
import { EXPERIMENTS, type ExperimentId, type SessionState } from "./types";

const RING_BUFFER_SIZE = 200;

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

const states = ref<Record<ExperimentId, SessionState>>(emptyStateMap());
const buffers = ref<Record<ExperimentId, string[]>>(emptyBufferMap());
const recency = ref<ExperimentId[]>([]);
const activeExperiment = ref<ExperimentId | null>(null);

export function useSessions() {
  return {
    states,
    buffers,
    recency,
    activeExperiment,

    setState(id: ExperimentId, state: SessionState): void {
      states.value[id] = state;
    },

    appendOutput(id: ExperimentId, line: string): void {
      const buf = buffers.value[id];
      buf.push(line);
      if (buf.length > RING_BUFFER_SIZE) {
        buf.splice(0, buf.length - RING_BUFFER_SIZE);
      }
    },

    touch(id: ExperimentId): void {
      const idx = recency.value.indexOf(id);
      if (idx !== -1) {
        recency.value.splice(idx, 1);
      }
      recency.value.push(id);
    },

    focus(id: ExperimentId): void {
      activeExperiment.value = id;
    },

    reset(): void {
      states.value = emptyStateMap();
      buffers.value = emptyBufferMap();
      recency.value = [];
      activeExperiment.value = null;
    },
  };
}
