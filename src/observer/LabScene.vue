<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {Colleague, ScientistId} from '../roster/types';
import type {ActivityState} from './types';

import {COLLEAGUES, colleagueLabel, targetLabel} from '../roster/types';
import {useColleagues} from '../roster/useColleagues';
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
    colleague?: string | null;
    activity: ActivityState;
    detail: string;
    target: string;
    mission: string;
    startedAtMs: number | null;
    idleWarn: boolean;
    crashed: boolean;
}

/** An end of the bench whose colleague failed to open (#00041 §12 #8). */
interface SceneVacancy {
    colleague: Colleague;
    label: string;
}

// The controller surface returned by `initScene` — kept as a local
// interface because the scene module is plain JS and cannot export TS
// types directly. Mirrors the seam contract in scene.js's return value.
// The Long Bench (#00041 §5) extended it — never broke it — with `resize`
// (the canvas is sized to its container), `setTube` (the bells' own words),
// `setVacant` (a bench that failed to open) and `deliver` (one crossing per
// rise of mail). `getStationPos` now answers with the figure's CURRENT
// position, or null while that colleague has no figure (the D4 fix).
interface SceneController {
    setRoster: (entries: SceneRosterEntry[]) => void;
    setSelected: (id: ScientistId | null) => void;
    setStrip: (on: boolean) => void;
    setTube: (labels: Record<Colleague, string>) => void;
    setVacant: (list: SceneVacancy[]) => void;
    deliver: (receiver: Colleague) => 'started' | 'queued' | 'dropped';
    resize: (width: number) => void;
    getStationPos: (id: ScientistId) => {x: number; y: number} | null;
    getFloorSize: () => {w: number; h: number};
    pauseRaf: () => void;
    resumeRaf: () => void;
    destroy: () => void;
}

interface Props {
    /** The compact posture: the same bench drawing, cropped to 64px. */
    strip?: boolean;
    active?: boolean;
}

const {strip = false, active = true} = defineProps<Props>();
const emit = defineEmits<{placed: []}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const roster = useRoster();
const observer = useObserver();
const backend = useRosterBackend();
const idleWarning = useIdleWarning();
const colleagues = useColleagues();

let controller: SceneController | null = null;
let resizeObserver: ResizeObserver | null = null;
const unwatchers: (() => void)[] = [];

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
            colleague: s.colleague,
            activity,
            detail,
            target: s.colleague ? colleagueLabel(s.colleague) : targetLabel(s.target),
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

// The Speaking Tube's own words, verbatim from `tubeLabel` — written on the
// bench under each bell, never a tooltip (#00041 §11.3).
const tubeWords = computed<Record<Colleague, string>>(() => ({
    'mad-scientist': colleagues.tubeLabel('mad-scientist'),
    heretic: colleagues.tubeLabel('heretic'),
}));

// The one path that still reaches an empty end of the bench: that colleague's
// bench failed to open (a launch error on record, no live figure).
const vacancies = computed<SceneVacancy[]>(() =>
    COLLEAGUES.filter((c) => colleagues.errors.value[c] !== undefined && colleagues.bench(c) === undefined).map(
        (c) => ({colleague: c, label: colleagueLabel(c)}),
    ),
);

function pushTubeToScene(): void {
    if (controller) controller.setTube(tubeWords.value);
}

function pushVacanciesToScene(): void {
    if (controller) controller.setVacant(vacancies.value);
}

/** One crossing per RISE of mail at a colleague's bench — `tubeArrivals`
 *  counts rises, never letters. The scene queues at most one crossing
 *  behind the one in progress and never restarts it. */
function crossOnArrival(next: Record<Colleague, number>, prev: Record<Colleague, number> | undefined): void {
    if (!controller || !prev) return;
    for (const c of COLLEAGUES) {
        for (let rise = prev[c]; rise < next[c]; rise++) controller.deliver(c);
    }
}

function fitToContainer(): void {
    const width = containerRef.value?.clientWidth ?? 0;
    // A hidden page measures zero; the bench keeps its last honest width.
    if (controller && width >= 2) controller.resize(width);
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
            onPlaced?: () => void;
        }) => SceneController;
    };
    controller = mod.initScene({
        canvas: canvasRef.value,
        // The selected figure moved (or the drawing re-cut): the plumb-line
        // re-reads its CURRENT x in the same frame (trip-wire 8).
        onPlaced: () => emit('placed'),
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
    fitToContainer();
    pushRosterToScene();
    pushSelectedToScene();
    pushStripToScene();
    pushTubeToScene();
    pushVacanciesToScene();
    if (!active) controller.pauseRaf();
    // Reactively re-push when the roster or activity map changes.
    unwatchers.push(
        watch(rosterEntries, pushRosterToScene, {deep: true}),
        watch(() => observer.activities.value, pushRosterToScene, {deep: true}),
        watch(() => roster.selected.value, pushSelectedToScene),
        watch(() => strip, pushStripToScene),
        watch(tubeWords, pushTubeToScene, {deep: true}),
        watch(vacancies, pushVacanciesToScene, {deep: true}),
        watch(() => ({...colleagues.tubeArrivals.value}), crossOnArrival),
    );
    resizeObserver = new ResizeObserver(fitToContainer);
    resizeObserver.observe(containerRef.value);
});

onBeforeUnmount(() => {
    for (const stop of unwatchers.splice(0)) stop();
    resizeObserver?.disconnect();
    resizeObserver = null;
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
    <div ref="containerRef" class="relative w-full h-full overflow-hidden">
        <!-- The bench renders at full DPR, sized to this container at full
             width — no integer SCALE, no letterbox (#00041 §2.3 D1). -->
        <canvas ref="canvasRef" class="block" data-observer-canvas></canvas>
    </div>
</template>
