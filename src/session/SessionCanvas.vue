<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import {useHistory} from '../chronicle/useHistory';
import {EXPERIMENTS, type ExperimentId} from './types';
import {useBackend} from './useBackend';
import {useSessions} from './useSessions';
import {useTerminals, type TerminalSlot} from './useTerminals';

const sessions = useSessions();
const history = useHistory();
const terminals = useTerminals();
const backend = useBackend();

const activeMeta = computed(() =>
    sessions.activeExperiment.value
        ? (EXPERIMENTS.find((e) => e.id === sessions.activeExperiment.value) ?? null)
        : null,
);

// One wrapper div per experiment, all stacked at position:absolute. Only
// the active wrapper has visibility:visible — the rest stay in layout
// (visibility:hidden) so FitAddon can compute correct dimensions on the
// instant a tab activates. xterm Terminals are opened into their wrapper
// the first time they go active and stay attached for the gadget's life.
const wrapperRefs: Partial<Record<ExperimentId, HTMLDivElement | null>> = {};

function setWrapperRef(id: ExperimentId, el: Element | null): void {
    wrapperRefs[id] = el as HTMLDivElement | null;
}

function fitAndPush(id: ExperimentId, slot: TerminalSlot): void {
    if (!slot.terminal.element) {
        return;
    }
    try {
        slot.fit.fit();
    } catch {
        // FitAddon throws on zero-size containers — happens during
        // first paint before layout settles. Next ResizeObserver tick
        // re-runs us with real dimensions, so swallow.
        return;
    }
    const cols = slot.terminal.cols;
    const rows = slot.terminal.rows;
    if (slot.lastSize && slot.lastSize.cols === cols && slot.lastSize.rows === rows) {
        return;
    }
    slot.lastSize = {cols, rows};
    void backend.resizeSession(id, cols, rows);
}

function activate(id: ExperimentId): void {
    const wrapper = wrapperRefs[id];
    if (!wrapper) {
        return;
    }
    const slot = terminals.get(id);
    if (!slot.terminal.element) {
        slot.terminal.open(wrapper);
    }
    void nextTick(() => {
        fitAndPush(id, slot);
        slot.terminal.focus();
    });
}

watch(
    () => sessions.activeExperiment.value,
    (id) => {
        if (id) {
            activate(id);
        }
    },
    {flush: 'post'},
);

let canvasObserver: ResizeObserver | null = null;

onMounted(() => {
    // If an experiment was already active by the time we mounted (e.g.
    // a hot reload), open it now.
    const id = sessions.activeExperiment.value;
    if (id) {
        activate(id);
    }
    canvasObserver = new ResizeObserver(() => {
        const active = sessions.activeExperiment.value;
        if (!active) {
            return;
        }
        fitAndPush(active, terminals.get(active));
    });
    for (const exp of EXPERIMENTS) {
        const w = wrapperRefs[exp.id];
        if (w) {
            canvasObserver.observe(w);
        }
    }
});

onBeforeUnmount(() => {
    canvasObserver?.disconnect();
    canvasObserver = null;
});

const headerHeightRef = ref<HTMLElement | null>(null);

async function openHistory(): Promise<void> {
    if (sessions.activeExperiment.value === null) {
        return;
    }
    await history.show(sessions.activeExperiment.value);
}
</script>

<template>
    <section class="flex-1 bg-wb-canvas overflow-hidden flex flex-col min-h-0">
        <header
            v-if="activeMeta"
            ref="headerHeightRef"
            class="px-6 py-3 border-b border-wb-edge-soft flex items-center justify-between flex-shrink-0"
        >
            <div>
                <div class="wb-stamp-label">Active Bench</div>
                <h2 class="font-display text-wb-text text-base tracking-wide mt-0.5">
                    {{ activeMeta.label }}
                </h2>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-wb-text-faint font-mono text-xs">{{ activeMeta.wslRelativePath }}</span>
                <button type="button" class="wb-button" data-canvas-history @click="openHistory">History</button>
            </div>
        </header>

        <div v-if="!activeMeta" class="flex-1 flex items-center justify-center">
            <div class="text-center max-w-md">
                <div class="wb-stamp-label mb-3">No session running</div>
                <p class="text-wb-text-mute font-display text-sm">
                    Tools racked. Click an experiment to start a session.
                </p>
            </div>
        </div>

        <div v-else class="relative flex-1 overflow-hidden">
            <div
                v-for="exp in EXPERIMENTS"
                :key="exp.id"
                :ref="(el) => setWrapperRef(exp.id, el as Element | null)"
                class="absolute inset-0 px-3 py-2"
                :style="{visibility: sessions.activeExperiment.value === exp.id ? 'visible' : 'hidden'}"
            ></div>
        </div>
    </section>
</template>

<style>
/* xterm.js renders its own canvas inside the wrapper. The pre-flight
   default has overflow:hidden on body which can clip selection drag —
   but only the wrapper needs scroll coordination, and xterm handles
   its own scrollbar. Pin xterm's viewport to the wrapper. */
.xterm,
.xterm-viewport,
.xterm-screen {
    height: 100%;
    width: 100%;
}
.xterm-viewport::-webkit-scrollbar {
    width: 8px;
}
.xterm-viewport::-webkit-scrollbar-thumb {
    background: rgba(54, 61, 71, 0.55);
}
.xterm-viewport::-webkit-scrollbar-thumb:hover {
    background: rgba(212, 162, 76, 0.55);
}
</style>
