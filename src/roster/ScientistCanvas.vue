<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, watch} from 'vue';

import type {ScientistId} from './types';

import {targetLabel} from './types';
import {useRoster} from './useRoster';
import {useRosterBackend} from './useRosterBackend';
import {useScientistTerminals, type TerminalSlot} from './useScientistTerminals';

const roster = useRoster();
const terminals = useScientistTerminals();
const backend = useRosterBackend();

const selected = computed(() => roster.selectedScientist.value);
const target = computed(() => (selected.value ? targetLabel(selected.value.target) : null));

// One wrapper div per scientist, stacked at position:absolute. Only the
// selected wrapper has visibility:visible — the rest stay in layout
// (visibility:hidden) so FitAddon can compute correct dimensions on the
// instant a row activates. xterm Terminals are opened into their wrapper
// the first time the scientist is selected and stay attached until recall.
const wrapperRefs = new Map<ScientistId, HTMLDivElement | null>();

function setWrapperRef(id: ScientistId, el: Element | null): void {
    wrapperRefs.set(id, el as HTMLDivElement | null);
}

function fitAndPush(id: ScientistId, slot: TerminalSlot): void {
    if (!slot.terminal.element) {
        return;
    }
    try {
        slot.fit.fit();
    } catch {
        // FitAddon throws on zero-size containers — happens during first
        // paint before layout settles. Next ResizeObserver tick re-runs us
        // with real dimensions, so swallow.
        return;
    }
    const cols = slot.terminal.cols;
    const rows = slot.terminal.rows;
    if (slot.lastSize && slot.lastSize.cols === cols && slot.lastSize.rows === rows) {
        return;
    }
    slot.lastSize = {cols, rows};
    void backend.resize(id, cols, rows);
}

function activate(id: ScientistId): void {
    const wrapper = wrapperRefs.get(id);
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
    () => roster.selected.value,
    (id) => {
        if (id) {
            activate(id);
        }
    },
    {flush: 'post'},
);

let canvasObserver: ResizeObserver | null = null;

onMounted(() => {
    if (roster.selected.value) {
        activate(roster.selected.value);
    }
    canvasObserver = new ResizeObserver(() => {
        const active = roster.selected.value;
        if (!active) {
            return;
        }
        fitAndPush(active, terminals.get(active));
    });
    for (const wrapper of wrapperRefs.values()) {
        if (wrapper) {
            canvasObserver.observe(wrapper);
        }
    }
});

onBeforeUnmount(() => {
    canvasObserver?.disconnect();
    canvasObserver = null;
});
</script>

<template>
    <section class="flex-1 bg-mz-canvas overflow-hidden flex flex-col min-h-0">
        <header
            v-if="selected"
            class="px-6 py-3 border-b border-mz-edge-soft flex items-center justify-between flex-shrink-0"
        >
            <div>
                <div class="mz-stamp-label">Dispatched Scientist</div>
                <h2 class="font-display text-mz-text text-base tracking-wide mt-0.5">
                    {{ target }}
                </h2>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-mz-text-faint font-mono text-xs truncate max-w-md">
                    {{ selected.mission || '—' }}
                </span>
            </div>
        </header>

        <div v-if="!selected" class="flex-1 flex items-center justify-center">
            <div class="text-center max-w-md">
                <div class="mz-stamp-label mb-3">Balcony quiet</div>
                <p class="text-mz-text-mute font-display text-sm">
                    No scientist selected. Dispatch one from the balcony, or click a roster row.
                </p>
            </div>
        </div>

        <div v-else class="relative flex-1 overflow-hidden">
            <div
                v-for="s in roster.scientists.value"
                :key="s.id"
                :ref="(el) => setWrapperRef(s.id, el as Element | null)"
                class="absolute inset-0 px-3 py-2"
                :style="{visibility: roster.selected.value === s.id ? 'visible' : 'hidden'}"
            ></div>
        </div>
    </section>
</template>

<style>
/* xterm.js renders its own canvas inside the wrapper. Pin xterm's viewport
 * to the wrapper so it fills the canvas region without spilling. */
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
