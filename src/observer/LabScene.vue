<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ScientistId} from '../roster/types';
import type {ActivityState} from './types';

import {useRoster} from '../roster/useRoster';
import {activityFromMission, useObserver} from './useObserver';

// The controller surface returned by `initScene` — kept as a local
// interface because the scene module is plain JS and cannot export TS
// types directly. Mirrors the seam contract in scene.js's return value.
interface SceneController {
    setRoster: (entries: Array<{id: ScientistId; activity: ActivityState; detail: string}>) => void;
    setSelected: (id: ScientistId | null) => void;
    pauseRaf: () => void;
    resumeRaf: () => void;
    destroy: () => void;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const roster = useRoster();
const observer = useObserver();

let controller: SceneController | null = null;
let unwatchRoster: (() => void) | null = null;
let unwatchActivities: (() => void) | null = null;
let unwatchSelected: (() => void) | null = null;

// The character-array shape the scene controller expects. We compute
// one entry per Roster scientist; the activity falls back to the
// MissionState mapping when the chronicle stream has not yet produced
// an inference signal.
const rosterEntries = computed(() =>
    roster.scientists.value.map((s) => {
        const fromChronicle = observer.activities.value.get(s.id);
        const activity: ActivityState = fromChronicle?.state ?? activityFromMission(s.state);
        const detail = fromChronicle?.detail ?? '...';
        return {id: s.id, activity, detail};
    }),
);

function pushRosterToScene(): void {
    if (controller) controller.setRoster(rosterEntries.value);
}

function pushSelectedToScene(): void {
    if (controller) controller.setSelected(roster.selected.value);
}

onMounted(async () => {
    if (!canvasRef.value || !containerRef.value) return;
    // Dynamic import of the lifted scene module keeps the canvas
    // renderer out of the initial bundle entry — the first time the
    // investor opens the floor, the chunk loads.
    const mod = (await import('./scene.js')) as unknown as {
        initScene: (opts: {
            canvas: HTMLCanvasElement;
            onInteraction?: (msg: {type: string; action?: string}) => void;
        }) => SceneController;
    };
    controller = mod.initScene({
        canvas: canvasRef.value,
        onInteraction: () => {
            // Arc 2 has no consumer for zone clicks; the seam stays
            // wired so Arc 3 / a future arc can dispatch a scientist
            // into a clicked experiment chamber.
        },
    });
    // Push initial state.
    pushRosterToScene();
    pushSelectedToScene();
    // Reactively re-push when the roster or activity map changes.
    unwatchRoster = watch(rosterEntries, pushRosterToScene, {deep: true});
    unwatchActivities = watch(() => observer.activities.value, pushRosterToScene, {deep: true});
    unwatchSelected = watch(() => roster.selected.value, pushSelectedToScene);
});

onBeforeUnmount(() => {
    if (unwatchRoster) {
        unwatchRoster();
        unwatchRoster = null;
    }
    if (unwatchActivities) {
        unwatchActivities();
        unwatchActivities = null;
    }
    if (unwatchSelected) {
        unwatchSelected();
        unwatchSelected = null;
    }
    if (controller) {
        controller.destroy();
        controller = null;
    }
});

function pauseRaf(): void {
    if (controller) controller.pauseRaf();
}
function resumeRaf(): void {
    if (controller) controller.resumeRaf();
}
defineExpose({pauseRaf, resumeRaf});
</script>

<template>
    <div
        ref="containerRef"
        class="relative w-full h-full bg-mz-canvas overflow-hidden flex items-center justify-center"
    >
        <canvas
            ref="canvasRef"
            class="block image-rendering-pixelated"
            style="image-rendering: pixelated"
            data-observer-canvas
        ></canvas>
    </div>
</template>
