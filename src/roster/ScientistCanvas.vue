<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ScientistId} from './types';

import HereticChat from '../heretic/HereticChat.vue';
import {bookmarkViewport, restoreViewport} from './terminalViewport';
import {COLLEAGUES, colleagueLabel} from './types';
import {useRoster} from './useRoster';
import {useRosterBackend} from './useRosterBackend';
import {useScientistTerminals, type TerminalSlot} from './useScientistTerminals';

const {active = true} = defineProps<{active?: boolean}>();
const roster = useRoster();
const terminals = useScientistTerminals();
const backend = useRosterBackend();
const canvasRef = ref<HTMLElement | null>(null);
const hereticTerminalExpanded = ref(false);
const panes = computed(() =>
    COLLEAGUES.map((identity) => ({
        identity,
        scientist: roster.scientists.value.find((s) => s.colleague === identity),
    })),
);

// The Mad Scientist's terminal is the keystroke witness for the Errand Floor (#00067 P2): a
// minion arriving within 1.5 s of his typing skips its grip on the rail he is writing under.
watch(
    () => panes.value.find((p) => p.identity === 'mad-scientist')?.scientist?.id ?? null,
    (id) => terminals.setKeystrokeWitness(id),
    {immediate: true},
);
const wrapperRefs = new Map<ScientistId, HTMLDivElement>();
const parkedViewports = new Map<ScientistId, ReturnType<typeof bookmarkViewport>>();
let canvasObserver: ResizeObserver | null = null;
let restoreFrame: number | null = null;
let unmounted = false;

// xterm measures its character cell once, when a terminal opens, and never
// again unless a font option changes. Opening before the self-hosted
// JetBrains Mono has loaded measured the FALLBACK face (~7.83×18 instead of
// 8×20): every fit then asked for too many rows (26 where 23 fit), and once
// the real face arrived those rows drew past the pane's bottom edge — the
// last two lines of every conversation clipped (found 2026-09-22, witnessed
// by both colleagues). So a terminal opens only once its face is loaded; if
// the face is slow, it opens on the fallback after FONT_WAIT_MS and is
// re-measured the moment the face lands.
const TERMINAL_FACES = ['13px "JetBrains Mono"', 'bold 13px "JetBrains Mono"'];
const FONT_WAIT_MS = 3000;

function terminalFacesPending(): Promise<boolean> | null {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts || typeof fonts.load !== 'function' || typeof fonts.check !== 'function') return null;
    if (TERMINAL_FACES.every((face) => fonts.check(face))) return null;
    const loaded = Promise.all(TERMINAL_FACES.map((face) => fonts.load(face))).then(
        () => true,
        () => false,
    );
    const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), FONT_WAIT_MS));
    void loaded.then((ok) => {
        if (ok) remeasureOpenTerminals();
    });
    return Promise.race([loaded, late]);
}

/** Re-measure terminals that opened on the fallback face, then refit them.
 *  Re-assigning an equivalent `fontFamily` spelling is xterm's public way to
 *  make it measure the cell again. */
function remeasureOpenTerminals(): void {
    if (unmounted) return;
    for (const {scientist} of panes.value) {
        if (!scientist) continue;
        const slot = terminals.get(scientist.id);
        if (!slot.terminal.element) continue;
        const family = slot.terminal.options.fontFamily ?? '';
        slot.terminal.options.fontFamily = family.endsWith(' ') ? family.trimEnd() : `${family} `;
        fitAndPush(scientist.id, slot);
    }
}

function setWrapperRef(id: ScientistId, el: Element | null): void {
    if (el) {
        wrapperRefs.set(id, el as HTMLDivElement);
        canvasObserver?.observe(el);
    } else wrapperRefs.delete(id);
}

function hasVisibleBox(id: ScientistId): boolean {
    const box = wrapperRefs.get(id)?.getBoundingClientRect();
    return active && !!box && box.width >= 2 && box.height >= 2;
}

function queueViewportRestore(): void {
    if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
    // xterm synchronizes its DOM scrollbar on a render frame. Restoring before
    // that sync lets its queued scroll event move the viewport a second time.
    // Keep the same bookmarks through any intervening ResizeObserver delivery.
    restoreFrame = requestAnimationFrame(() => {
        restoreFrame = requestAnimationFrame(() => {
            restoreFrame = null;
            if (!active) return;
            for (const [id, bookmark] of parkedViewports) {
                if (!hasVisibleBox(id)) continue;
                restoreViewport(terminals.get(id).terminal, bookmark);
                parkedViewports.delete(id);
            }
        });
    });
}

function fitAndPush(id: ScientistId, slot: TerminalSlot): void {
    // A hidden FitAddon can reflow thousands of lines into two columns,
    // trimming scrollback permanently. Navigation must never resize a hidden PTY.
    if (!slot.terminal.element || !hasVisibleBox(id)) return;
    if (!parkedViewports.has(id)) parkedViewports.set(id, bookmarkViewport(slot.terminal));
    try {
        slot.fit.fit();
    } catch {
        // The resize observer retries after the first non-zero layout.
        return;
    } finally {
        queueViewportRestore();
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
    const faces = terminalFacesPending();
    if (faces) {
        await faces;
        if (unmounted) return;
    }
    for (const [id, bookmark] of parkedViewports) {
        if (wrapperRefs.has(id)) continue;
        bookmark?.dispose();
        parkedViewports.delete(id);
    }
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
        const isReader =
            panes.value.some((pane) => pane.identity === 'heretic' && pane.scientist?.id === id) &&
            !hereticTerminalExpanded.value;
        if (active && id && wrapperRefs.has(id) && !isReader) terminals.get(id).terminal.focus();
    },
    {flush: 'post'},
);
watch(hereticTerminalExpanded, () => {
    void nextTick(fitBoth);
});

watch(
    () => active,
    (visible) => {
        if (visible) {
            void nextTick(fitBoth);
        } else {
            for (const {scientist} of panes.value) {
                if (!scientist) continue;
                if (!parkedViewports.has(scientist.id)) {
                    parkedViewports.set(scientist.id, bookmarkViewport(terminals.get(scientist.id).terminal));
                }
            }
        }
    },
);

onMounted(() => {
    void mountTerminals();
    canvasObserver = new ResizeObserver(fitBoth);
    if (canvasRef.value) canvasObserver.observe(canvasRef.value);
    for (const wrapper of wrapperRefs.values()) canvasObserver.observe(wrapper);
});
onBeforeUnmount(() => {
    unmounted = true;
    canvasObserver?.disconnect();
    if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
    for (const bookmark of parkedViewports.values()) bookmark?.dispose();
});
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
            <HereticChat
                v-if="identity === 'heretic' && scientist"
                v-show="!hereticTerminalExpanded"
                :key="scientist.id"
                :scientist-id="scientist.id"
                :active="active && !hereticTerminalExpanded"
            />
            <div
                v-if="identity === 'heretic' && scientist"
                class="flex-shrink-0 flex items-center justify-between px-3 py-1 border-t border-mz-edge text-[10px] text-mz-text-mute bg-mz-rail"
            >
                <span>CLI controls · questions &amp; permissions</span>
                <button
                    type="button"
                    class="text-mz-brass bg-transparent border-0 cursor-pointer hover:underline"
                    :aria-expanded="hereticTerminalExpanded"
                    @click="hereticTerminalExpanded = !hereticTerminalExpanded"
                >
                    {{ hereticTerminalExpanded ? 'Return to Graphite' : 'Expand CLI' }}
                </button>
            </div>
            <div
                class="relative min-h-0 overflow-hidden"
                :class="identity === 'heretic' && scientist && !hereticTerminalExpanded ? 'flex-shrink-0' : 'flex-1'"
                :style="
                    identity === 'heretic' && scientist && !hereticTerminalExpanded
                        ? {height: 'clamp(96px, 15vh, 140px)'}
                        : undefined
                "
            >
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
                <div
                    v-if="scientist && terminals.get(scientist.id).links.notice.value"
                    class="absolute bottom-0 left-0 right-0 z-10 bg-mz-rail border-t border-mz-edge px-3 py-2 text-xs flex items-center gap-2"
                    :class="{'pointer-events-none': !terminals.get(scientist.id).links.notice.value?.error}"
                    data-link-notice
                    :role="terminals.get(scientist.id).links.notice.value?.error ? 'alert' : undefined"
                >
                    <span class="truncate flex-1" :title="terminals.get(scientist.id).links.notice.value?.text">
                        {{ terminals.get(scientist.id).links.notice.value?.text }}
                    </span>
                    <button
                        v-if="terminals.get(scientist.id).links.notice.value?.error"
                        type="button"
                        aria-label="Dismiss link error"
                        @click="terminals.get(scientist.id).links.notice.value = null"
                    >
                        ×
                    </button>
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
