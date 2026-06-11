<script setup lang="ts">
// LabFloor — the permanent lower storey of the two-storey frame (#00057).
//
// This is the Overlook's one non-negotiable bold choice made code: the
// Observer scene, lifted out of the retired ObserverPanel's dialog
// chrome and mounted as the floor the investor permanently stands
// above. No dialog, no toggle, no close button. On short windows it
// surrenders height down to a 64px strip — never to zero. If this
// component can be dismissed, the redesign has not happened.
//
// RAF gating moved from panel open/close (there is no panel) to window
// focus + the OS reduced-motion preference. The chronicle subscription
// stays push-always in App.vue — the floor renders state that was
// always flowing.

import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ScientistId} from '../roster/types';
import type {ActivityState} from './types';

import {useRoster} from '../roster/useRoster';
import LabScene from './LabScene.vue';
import {floorPointToPage} from './projection';
import {activityFromMission, useObserver} from './useObserver';

interface Props {
    /** Short-window collapse (window.innerHeight < 820): the 64px strip. */
    collapsed?: boolean;
}

const {collapsed = false} = defineProps<Props>();

interface LabSceneApi {
    pauseRaf?: () => void;
    resumeRaf?: () => void;
    getStationPos?: (id: ScientistId) => {x: number; y: number} | null;
    getFloorSize?: () => {w: number; h: number} | null;
    getCanvasEl?: () => HTMLCanvasElement | null;
}

const sceneRef = ref<LabSceneApi | null>(null);
const floorRef = ref<HTMLElement | null>(null);

const roster = useRoster();
const observer = useObserver();

const isEmpty = computed(() => roster.scientists.value.length === 0);

// Peek: the strip's "expand the floor" affordance. A temporary look
// downstairs — the floor reclaims its full height until the pointer
// leaves. The strip state itself is owned by App.vue's window-height
// watcher; peek is the floor's own small courtesy.
const peek = ref(false);

watch(
    () => collapsed,
    () => {
        peek.value = false;
    },
);

const showFull = computed(() => !collapsed || peek.value);

// --- Light pools ---------------------------------------------------------
// CSS radial overlays over the sprites' station coordinates — NOT canvas
// relighting (the Artisan's documented Ferrari, parked for a future arc).
// Opacity is a total function of ActivityState: every member of the
// union has a declared output. The crash burns; it does not dim.
function poolOpacity(state: ActivityState): number {
    switch (state) {
        case 'idle':
        case 'waiting':
            return 0.4;
        case 'thinking':
        case 'writing':
        case 'reading':
        case 'running':
        case 'error':
            return 0.85;
        default: {
            const _exhaustive: never = state;
            throw new Error(`unreachable activity state: ${String(_exhaustive)}`);
        }
    }
}

// The selection re-center (§4): the selected station's pool fades up to
// the full 0.85 and sibling pools dim a notch (−0.1) — the light arrives
// just as the plumb-line lands. The base opacity stays a total function
// of ActivityState; selection modulates it.
function poolOpacityFor(id: ScientistId, state: ActivityState): number {
    const base = poolOpacity(state);
    const selected = roster.selected.value;
    if (selected === null) {
        return base;
    }
    if (id === selected) {
        return Math.max(base, 0.85);
    }
    return Math.max(0.1, Math.round((base - 0.1) * 100) / 100);
}

const pools = computed(() =>
    roster.scientists.value.map((s) => {
        const fromChronicle = observer.activities.value.get(s.id);
        const state: ActivityState = fromChronicle?.state ?? activityFromMission(s.state);
        return {
            id: s.id,
            state,
            opacity: poolOpacityFor(s.id, state),
            burning: state === 'error',
            selected: roster.selected.value === s.id,
        };
    }),
);

// Station coordinates → CSS positions relative to the floor section.
// The canvas may be CSS-scaled (logical 448px floor displayed larger),
// so positions divide by the logical floor size and multiply by the
// canvas's measured rect (experiment log §11).
const poolPositions = ref<Map<ScientistId, {left: number; top: number}>>(new Map());

interface FloorGeometry {
    canvasRect: DOMRect;
    size: {w: number; h: number};
}

/** The measured canvas rect + logical floor size — null until the scene
 *  is mounted and has real dimensions. */
function floorGeometry(): FloorGeometry | null {
    const scene = sceneRef.value;
    const canvas = scene?.getCanvasEl?.();
    const size = scene?.getFloorSize?.();
    if (!canvas || !size || size.w === 0 || size.h === 0) {
        return null;
    }
    return {canvasRect: canvas.getBoundingClientRect(), size};
}

function recomputePoolPositions(): void {
    const geometry = floorGeometry();
    const host = floorRef.value;
    if (!geometry || !host) return;
    const {canvasRect, size} = geometry;
    const hostRect = host.getBoundingClientRect();
    const next = new Map<ScientistId, {left: number; top: number}>();
    for (const s of roster.scientists.value) {
        const pos = sceneRef.value?.getStationPos?.(s.id);
        if (!pos) continue;
        const page = floorPointToPage(pos, size, canvasRect);
        next.set(s.id, {
            left: page.x - hostRect.left,
            top: page.y - hostRect.top,
        });
    }
    poolPositions.value = next;
}

function poolStyle(pool: {id: ScientistId; opacity: number; burning: boolean}): Record<string, string> {
    const pos = poolPositions.value.get(pool.id);
    const tint = pool.burning ? 'rgba(248, 113, 113, 0.55)' : 'rgba(212, 162, 76, 0.45)';
    return {
        left: `${pos?.left ?? 0}px`,
        top: `${pos?.top ?? 0}px`,
        opacity: String(pool.opacity),
        background: `radial-gradient(circle, ${tint} 0%, transparent 70%)`,
    };
}

watch([pools, () => collapsed], () => {
    void nextTick(() => {
        recomputePoolPositions();
    });
});

// --- RAF gating: window focus + reduced motion ---------------------------
// The scene's own RAF loop already consults matchMedia directly for the
// reduced-motion freeze (gadget protocol); the floor adds the focus
// gate — an unfocused window burns no CPU drawing sprites nobody sees.
function reducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function onWindowBlur(): void {
    sceneRef.value?.pauseRaf?.();
}

function onWindowFocus(): void {
    if (reducedMotion()) return;
    sceneRef.value?.resumeRaf?.();
}

function onWindowResize(): void {
    recomputePoolPositions();
}

onMounted(() => {
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('resize', onWindowResize);
    void nextTick(() => {
        recomputePoolPositions();
    });
});

onBeforeUnmount(() => {
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    window.removeEventListener('resize', onWindowResize);
});

function togglePeek(): void {
    peek.value = !peek.value;
}

function endPeek(): void {
    peek.value = false;
}

// Station → page coordinates for the plumb-line (App.vue's plumbX).
// Same CSS-scale correction as the pools, but in page space — the
// RailingDivider spans the full frame width and subtracts its own rect.
function stationToPage(id: ScientistId): {x: number; y: number} | null {
    const geometry = floorGeometry();
    const pos = sceneRef.value?.getStationPos?.(id);
    if (!geometry || !pos) return null;
    const {canvasRect, size} = geometry;
    return floorPointToPage(pos, size, canvasRect);
}

defineExpose({recomputePoolPositions, stationToPage, sceneRef});
</script>

<template>
    <section
        ref="floorRef"
        class="relative flex-shrink-0 bg-mz-canvas overflow-hidden"
        :style="{height: showFull ? '40vh' : '64px', minHeight: '64px'}"
        data-lab-floor
        :data-floor-collapsed="collapsed && !peek ? 'true' : 'false'"
        aria-label="The lab floor below"
        @mouseleave="endPeek"
    >
        <!-- The Observer engine, rehosted — was ObserverPanel > LabScene -->
        <LabScene ref="sceneRef" :strip="collapsed && !peek" />

        <!-- Perspective hint: further down = darker. A gradient OVERLAY —
             never a transform on the canvas pixels; pixel-art stays crisp. -->
        <div
            v-if="showFull"
            class="pointer-events-none absolute inset-0"
            style="background: linear-gradient(to bottom, transparent, rgba(11, 13, 16, 0.6))"
            data-floor-gradient
        ></div>

        <!-- Light pools: the floor lights up where work is happening,
             before anyone is selected. The investor reads "who is busy"
             by where the light is. -->
        <div v-if="showFull" class="pointer-events-none absolute inset-0" data-light-pools>
            <div
                v-for="pool in pools"
                :key="pool.id"
                class="light-pool absolute w-32 h-20 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-600 ease-out"
                :data-pool-id="pool.id"
                :data-pool-state="pool.state"
                :data-pool-burning="pool.burning ? 'true' : 'false'"
                :data-pool-selected="pool.selected ? 'true' : 'false'"
                :style="poolStyle(pool)"
            ></div>
        </div>

        <!-- The empty-state voice lives HERE, on the floor — the absence
             is felt downstairs. The strip is never silent and unlabelled. -->
        <div v-if="isEmpty" class="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p class="mz-stamp-label text-mz-text-faint" data-floor-empty>
                {{ showFull ? 'Balcony quiet. No scientists dispatched.' : 'Balcony quiet.' }}
            </p>
        </div>

        <!-- Short-window affordance: a temporary look downstairs -->
        <button
            v-if="collapsed"
            type="button"
            class="mz-button-icon absolute top-1 right-1 z-10"
            :aria-label="peek ? 'Return to the strip' : 'Expand the floor'"
            data-floor-expand
            @click="togglePeek"
        >
            {{ peek ? '⌄' : '⌃' }}
        </button>
    </section>
</template>
