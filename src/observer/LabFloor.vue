<script setup lang="ts">
// The Long Bench's band (#00041 §5) — the page below the railing, mounted
// with ConversationPage for the life of the app. Its `active` prop pauses
// drawing while another page is visible; window focus and reduced motion
// remain independent gates. Chronicle events stay app-owned.
//
// Struck with the floor plan (§5.3): the CSS light pools and the double
// `requestAnimationFrame` that re-read their positions, the perspective
// gradient, and the `40vh` rule. The pools answered "who is busy" among many
// and were drawn in a different system from the thing they lit, which is how
// they came to lead their figures by up to 60 px (§2.3 D4). The wash that
// replaced them is drawn on the canvas, in the tick that places the figure.

import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ScientistId} from '../roster/types';

import LabScene from './LabScene.vue';
import {PAPER} from './pen';
import {BENCH_BAND_H, BENCH_STRIP_H, floorPointToPage} from './projection';

interface Props {
    /** The investor's choice: the compact posture — a 64px crop of the bench. */
    collapsed?: boolean;
    /** The short window (< 820px tall) forces the crop whatever was chosen. */
    forced?: boolean;
    active?: boolean;
}

const {collapsed = false, forced = false, active = true} = defineProps<Props>();
const emit = defineEmits<{'update:collapsed': [value: boolean]; placed: []}>();

interface LabSceneApi {
    pauseRaf?: () => void;
    resumeRaf?: () => void;
    getStationPos?: (id: ScientistId) => {x: number; y: number} | null;
    getFloorSize?: () => {w: number; h: number} | null;
    getCanvasEl?: () => HTMLCanvasElement | null;
}

const sceneRef = ref<LabSceneApi | null>(null);

// Peek: on a short window the crop is not a preference, so the control
// offers a temporary look at the whole bench instead, until the pointer
// leaves. On a tall window the control flips the investor's own choice.
const peek = ref(false);

watch(
    () => [collapsed, forced],
    () => {
        peek.value = false;
    },
);

const showFull = computed(() => (forced ? peek.value : !collapsed));

function onBenchControl(): void {
    if (forced) {
        peek.value = !peek.value;
        return;
    }
    emit('update:collapsed', !collapsed);
}

function endPeek(): void {
    peek.value = false;
}

// --- RAF gating: window focus + reduced motion ---------------------------
// The scene's own RAF loop consults matchMedia directly for the reduced-
// motion boil pin (gadget protocol); the band adds the focus gate — an
// unfocused window burns no CPU drawing ink nobody sees.
function reducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function onWindowBlur(): void {
    sceneRef.value?.pauseRaf?.();
}

function onWindowFocus(): void {
    if (!active || reducedMotion()) return;
    sceneRef.value?.resumeRaf?.();
}

watch(
    () => active,
    (visible) => {
        if (!visible) {
            sceneRef.value?.pauseRaf?.();
            peek.value = false;
        } else {
            onWindowFocus();
        }
    },
);

onMounted(() => {
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
});

onBeforeUnmount(() => {
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
});

/** The bench canvas and its drawn size — null until the scene is mounted
 *  and has real dimensions. */
function measuredCanvas(): {rect: DOMRect; size: {w: number; h: number}} | null {
    const canvas = sceneRef.value?.getCanvasEl?.();
    const size = sceneRef.value?.getFloorSize?.();
    if (!canvas || !size || size.w === 0 || size.h === 0) return null;
    return {rect: canvas.getBoundingClientRect(), size};
}

/** A figure's CURRENT position → page coordinates, for the plumb-line. The
 *  bench canvas renders 1:1 at full width, so this is the canvas offset —
 *  still routed through the measured rect so a scaled host cannot lie. */
function stationToPage(id: ScientistId): {x: number; y: number} | null {
    const measured = measuredCanvas();
    const pos = sceneRef.value?.getStationPos?.(id);
    if (!measured || !pos) return null;
    return floorPointToPage(pos, measured.size, measured.rect);
}

defineExpose({stationToPage, sceneRef});
</script>

<template>
    <section
        class="relative flex-shrink-0 overflow-hidden"
        :style="{height: `${showFull ? BENCH_BAND_H : BENCH_STRIP_H}px`, background: PAPER}"
        data-lab-floor
        :data-floor-collapsed="showFull ? 'false' : 'true'"
        aria-label="The lab floor below"
        @mouseleave="endPeek"
    >
        <LabScene ref="sceneRef" :strip="!showFull" :active="active" @placed="emit('placed')" />

        <!-- The ⌃ control: on a tall window it flips the investor's choice
             between the whole bench and its crop; below the 820px cliff the
             crop is forced and the control peeks at the whole bench. Drawn
             as an ink mark on the page, not a steel button dropped onto it. -->
        <button
            type="button"
            class="bench-control absolute top-1 right-1 z-10"
            :aria-label="showFull ? 'Return to the strip' : 'Expand the floor'"
            data-floor-expand
            @click="onBenchControl"
        >
            {{ showFull ? '⌄' : '⌃' }}
        </button>
    </section>
</template>

<style scoped>
.bench-control {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: transparent;
    /* INK at 0.7 on PAPER: 5.3:1, above the 3:1 non-text floor */
    color: rgba(43, 38, 32, 0.7);
    font:
        700 18px Caveat,
        cursive;
    line-height: 1;
    cursor: pointer;
}
.bench-control:hover {
    color: #2b2620;
}
.bench-control:focus-visible {
    outline: 2px solid #2b2620;
    outline-offset: 1px;
}
</style>
