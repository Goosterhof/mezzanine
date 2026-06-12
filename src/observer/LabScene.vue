<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ScientistId} from '../roster/types';
import type {ActivityState} from './types';

import {targetLabel} from '../roster/types';
import {useIdleWarning} from '../roster/useIdleWarning';
import {useRoster} from '../roster/useRoster';
import {useRosterBackend} from '../roster/useRosterBackend';
import {parseRecallScientistAction, parseSelectScientistAction} from './projection';
import {activityFromMission, useObserver} from './useObserver';

// The shape of one roster entry pushed down into the scene. The Field
// Journal (#00059 J-3) widened it with the caption fields the canvas
// margin notes carry now the DOM nameplates are retired: target label,
// mission fragment, dispatch timestamp (the page computes elapsed
// itself, per frame), the idle warning, and the crashed flag.
interface SceneRosterEntry {
    id: ScientistId;
    activity: ActivityState;
    detail: string;
    target: string;
    mission: string;
    startedAtMs: number | null;
    idleWarn: boolean;
    crashed: boolean;
}

// The controller surface returned by `initScene` — kept as a local
// interface because the scene module is plain JS and cannot export TS
// types directly. Mirrors the seam contract in scene.js's return value.
// The Overlook (#00057) widened it with `setStrip` (the 64px strip
// projection), `getStationPos` (plumb-line x + light-pool y), and
// `getFloorSize` (logical dimensions for CSS-scale correction).
interface SceneController {
    setRoster: (entries: SceneRosterEntry[]) => void;
    setSelected: (id: ScientistId | null) => void;
    setStrip: (on: boolean) => void;
    getStationPos: (id: ScientistId) => {x: number; y: number};
    getFloorSize: () => {w: number; h: number};
    pauseRaf: () => void;
    resumeRaf: () => void;
    destroy: () => void;
}

interface Props {
    /** The Overlook's short-window projection: sprites in a single 64px
     *  row — no pools, no perspective, just the scientists. */
    strip?: boolean;
}

const {strip = false} = defineProps<Props>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const roster = useRoster();
const observer = useObserver();
const backend = useRosterBackend();
const idleWarning = useIdleWarning();

let controller: SceneController | null = null;
let unwatchRoster: (() => void) | null = null;
let unwatchActivities: (() => void) | null = null;
let unwatchSelected: (() => void) | null = null;
let unwatchStrip: (() => void) | null = null;

// The character-array shape the scene controller expects. We compute
// one entry per Roster scientist; the activity falls back to the
// MissionState mapping when the chronicle stream has not yet produced
// an inference signal.
const rosterEntries = computed<SceneRosterEntry[]>(() =>
    roster.scientists.value.map((s) => {
        const fromChronicle = observer.activities.value.get(s.id);
        const activity: ActivityState = fromChronicle?.state ?? activityFromMission(s.state);
        const detail = fromChronicle?.detail ?? '...';
        const startedAtMs = Date.parse(s.startedAt);
        return {
            id: s.id,
            activity,
            detail,
            target: targetLabel(s.target),
            mission: s.mission,
            startedAtMs: Number.isNaN(startedAtMs) ? null : startedAtMs,
            idleWarn: idleWarning.isIdleWarning(s),
            crashed: s.state === 'crashed',
        };
    }),
);

function pushRosterToScene(): void {
    if (controller) controller.setRoster(rosterEntries.value);
}

function pushSelectedToScene(): void {
    if (controller) controller.setSelected(roster.selected.value);
}

function pushStripToScene(): void {
    if (controller) controller.setStrip(strip);
}

onMounted(async () => {
    if (!canvasRef.value || !containerRef.value) return;
    // Dynamic import of the lifted scene module keeps the canvas
    // renderer out of the initial bundle entry — the chunk loads the
    // first time the floor mounts.
    const mod = (await import('./scene.js')) as unknown as {
        initScene: (opts: {
            canvas: HTMLCanvasElement;
            onInteraction?: (msg: {type: string; action?: string}) => void;
        }) => SceneController;
    };
    controller = mod.initScene({
        canvas: canvasRef.value,
        onInteraction: (msg) => {
            // The recall pathway (#00059 J-3): the `[ recall ]` note in a
            // canvas margin caption rides the recallScientist:<id> wire
            // action — the same duty the retired DOM nameplate's Recall
            // button carried, same backend.recall(id) destination, new
            // venue. Checked first: the note sits inside the caption's
            // selection hit-region and must outrank it.
            const recallId = parseRecallScientistAction(msg.action);
            if (recallId !== null) {
                void backend.recall(recallId);
                return;
            }
            // The seam parked since Arc 2 has its consumer (#00057): a
            // figure click on the page selects the scientist — the same
            // signature gesture the railing plates once shared. The wire
            // format is owned by the projection module — the same
            // definition scene.js emits with, so the two ends cannot
            // drift.
            const id = parseSelectScientistAction(msg.action);
            if (id !== null) {
                roster.select(id);
            }
        },
    });
    // Push initial state.
    pushRosterToScene();
    pushSelectedToScene();
    pushStripToScene();
    // Reactively re-push when the roster or activity map changes.
    unwatchRoster = watch(rosterEntries, pushRosterToScene, {deep: true});
    unwatchActivities = watch(() => observer.activities.value, pushRosterToScene, {deep: true});
    unwatchSelected = watch(() => roster.selected.value, pushSelectedToScene);
    unwatchStrip = watch(() => strip, pushStripToScene);
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
    if (unwatchStrip) {
        unwatchStrip();
        unwatchStrip = null;
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
function getStationPos(id: ScientistId): {x: number; y: number} | null {
    return controller ? controller.getStationPos(id) : null;
}
function getFloorSize(): {w: number; h: number} | null {
    return controller ? controller.getFloorSize() : null;
}
function getCanvasEl(): HTMLCanvasElement | null {
    return canvasRef.value;
}
defineExpose({pauseRaf, resumeRaf, getStationPos, getFloorSize, getCanvasEl});
</script>

<template>
    <div
        ref="containerRef"
        class="relative w-full h-full bg-mz-canvas overflow-hidden flex items-center justify-center"
    >
        <!-- The page renders at full DPR and blits 1:1 — no pixelated
             image-rendering hint; that retired with the tile engine
             (#00059 J-2). The ink stays ink. -->
        <canvas ref="canvasRef" class="block" data-observer-canvas></canvas>
    </div>
</template>
