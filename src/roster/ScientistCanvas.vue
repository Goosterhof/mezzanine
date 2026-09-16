<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ScientistId} from './types';

import {COLLEAGUES, colleagueLabel} from './types';
import {useRoster} from './useRoster';
import {useRosterBackend} from './useRosterBackend';
import {useScientistTerminals, type TerminalSlot} from './useScientistTerminals';

const roster = useRoster();
const terminals = useScientistTerminals();
const backend = useRosterBackend();
const canvasRef = ref<HTMLElement | null>(null);
const panes = computed(() =>
    COLLEAGUES.map((identity) => ({
        identity,
        scientist: roster.scientists.value.find((s) => s.colleague === identity),
    })),
);
const wrapperRefs = new Map<ScientistId, HTMLDivElement>();
let canvasObserver: ResizeObserver | null = null;

function setWrapperRef(id: ScientistId, el: Element | null): void {
    if (el) wrapperRefs.set(id, el as HTMLDivElement);
    else wrapperRefs.delete(id);
}

function fitAndPush(id: ScientistId, slot: TerminalSlot): void {
    if (!slot.terminal.element) return;
    try {
        slot.fit.fit();
    } catch {
        // The resize observer retries after the first non-zero layout.
        return;
    }
    const {cols, rows} = slot.terminal;
    if (slot.lastSize?.cols === cols && slot.lastSize.rows === rows) return;
    slot.lastSize = {cols, rows};
    void backend.resize(id, cols, rows);
}

function fitBoth(): void {
    for (const {scientist} of panes.value) {
        if (scientist) fitAndPush(scientist.id, terminals.get(scientist.id));
    }
}

async function mountTerminals(): Promise<void> {
    await nextTick();
    for (const {scientist} of panes.value) {
        if (!scientist) continue;
        const wrapper = wrapperRefs.get(scientist.id);
        if (!wrapper) continue;
        const slot = terminals.get(scientist.id);
        if (!slot.terminal.element) slot.terminal.open(wrapper);
        fitAndPush(scientist.id, slot);
    }
}

function focusPane(id: ScientistId): void {
    roster.select(id);
    terminals.get(id).terminal.focus();
}

// Keep both terminals mounted: selecting a colleague changes only input focus.
watch(
    () => panes.value.map((p) => p.scientist?.id ?? '').join('|'),
    () => {
        void mountTerminals();
    },
    {flush: 'post'},
);
watch(
    () => roster.selected.value,
    (id) => {
        if (id && wrapperRefs.has(id)) terminals.get(id).terminal.focus();
    },
    {flush: 'post'},
);

onMounted(() => {
    void mountTerminals();
    canvasObserver = new ResizeObserver(fitBoth);
    if (canvasRef.value) canvasObserver.observe(canvasRef.value);
});
onBeforeUnmount(() => canvasObserver?.disconnect());
</script>

<template>
    <section
        ref="canvasRef"
        class="flex-1 grid grid-cols-2 gap-px bg-mz-edge min-h-0 min-w-0 overflow-hidden"
        aria-label="Both laboratory terminals"
    >
        <section
            v-for="{identity, scientist} in panes"
            :key="identity"
            class="flex flex-col min-h-0 min-w-0 bg-mz-canvas overflow-hidden"
            :data-terminal-pane="identity"
            :aria-label="colleagueLabel(identity)"
            @pointerdown.capture="scientist && roster.select(scientist.id)"
            @focusin="scientist && roster.select(scientist.id)"
        >
            <button
                type="button"
                class="flex items-center justify-between gap-3 px-4 py-2 bg-mz-canvas border-0 border-b border-solid flex-shrink-0 text-left"
                :class="
                    scientist && roster.selected.value === scientist.id
                        ? 'border-mz-brass text-mz-brass'
                        : 'border-mz-edge-soft text-mz-text-mute'
                "
                :disabled="!scientist"
                :aria-pressed="!!scientist && roster.selected.value === scientist.id"
                @click="scientist && focusPane(scientist.id)"
            >
                <span class="font-display text-sm">{{ colleagueLabel(identity) }}</span>
                <span class="font-mono text-xs">{{
                    scientist && roster.selected.value === scientist.id ? 'Typing here' : 'Click to type'
                }}</span>
            </button>
            <div class="relative flex-1 min-h-0 overflow-hidden">
                <div
                    v-if="scientist"
                    :key="scientist.id"
                    :ref="(el) => setWrapperRef(scientist.id, el as Element | null)"
                    class="absolute inset-0 px-3 py-2"
                    :data-terminal="scientist.id"
                ></div>
                <div v-else class="h-full flex items-center justify-center px-4 text-center text-mz-text-mute text-sm">
                    This bench opens after setup. Use its nameplate above to retry.
                </div>
            </div>
        </section>
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
