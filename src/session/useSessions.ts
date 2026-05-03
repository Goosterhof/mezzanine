import {ref} from 'vue';

import {EXPERIMENTS, type ExperimentId, type SessionState} from './types';

const RING_BUFFER_SIZE = 200;

function emptyStateMap(): Record<ExperimentId, SessionState> {
    const out = {} as Record<ExperimentId, SessionState>;
    for (const exp of EXPERIMENTS) {
        out[exp.id] = 'idle';
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

function emptyTailMap(): Record<ExperimentId, string> {
    const out = {} as Record<ExperimentId, string>;
    for (const exp of EXPERIMENTS) {
        out[exp.id] = '';
    }
    return out;
}

const states = ref<Record<ExperimentId, SessionState>>(emptyStateMap());
const buffers = ref<Record<ExperimentId, string[]>>(emptyBufferMap());
const pendingTails = ref<Record<ExperimentId, string>>(emptyTailMap());
const recency = ref<ExperimentId[]>([]);
const activeExperiment = ref<ExperimentId | null>(null);

function pushLine(id: ExperimentId, line: string): void {
    const buf = buffers.value[id];
    buf.push(line);
    if (buf.length > RING_BUFFER_SIZE) {
        buf.splice(0, buf.length - RING_BUFFER_SIZE);
    }
}

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
            pushLine(id, line);
        },

        /** Append a raw pty chunk that may contain partial lines.
         * Splits on `\n`; complete lines join the ring buffer, the trailing
         * fragment (if any) is held until the next chunk completes it.
         */
        appendChunk(id: ExperimentId, chunk: string): void {
            const combined = pendingTails.value[id] + chunk.replace(/\r\n/g, '\n').replace(/\r/g, '');
            const parts = combined.split('\n');
            pendingTails.value[id] = parts.at(-1) ?? '';
            for (let i = 0; i < parts.length - 1; i += 1) {
                pushLine(id, parts[i] ?? '');
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
            pendingTails.value = emptyTailMap();
            recency.value = [];
            activeExperiment.value = null;
        },
    };
}
