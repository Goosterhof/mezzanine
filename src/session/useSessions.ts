import {ref} from 'vue';

import {EXPERIMENTS, type ExperimentId, type SessionState} from './types';

function emptyStateMap(): Record<ExperimentId, SessionState> {
    const out = {} as Record<ExperimentId, SessionState>;
    for (const exp of EXPERIMENTS) {
        out[exp.id] = 'idle';
    }
    return out;
}

const states = ref<Record<ExperimentId, SessionState>>(emptyStateMap());
const recency = ref<ExperimentId[]>([]);
const activeExperiment = ref<ExperimentId | null>(null);

export function useSessions() {
    return {
        states,
        recency,
        activeExperiment,

        setState(id: ExperimentId, state: SessionState): void {
            states.value[id] = state;
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
            recency.value = [];
            activeExperiment.value = null;
        },
    };
}
