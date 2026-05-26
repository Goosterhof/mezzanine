<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';

import {useHolotable} from './useHolotable';

interface SceneController {
    setState: (payload: unknown) => void;
    pauseRaf: () => void;
    resumeRaf: () => void;
    destroy: () => void;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);
const infoPanelRef = ref<HTMLDivElement | null>(null);
const branchRef = ref<HTMLSpanElement | null>(null);
const statusRef = ref<HTMLSpanElement | null>(null);
const fpsRef = ref<HTMLSpanElement | null>(null);
const lastUpdateRef = ref<HTMLSpanElement | null>(null);

const holotable = useHolotable();
let controller: SceneController | null = null;
let unwatchState: (() => void) | null = null;

onMounted(async () => {
    if (!canvasRef.value || !containerRef.value) return;
    // Dynamic import keeps the 1835-line WebGL engine out of the main
    // bundle entry. The first time the investor opens the floor, the
    // chunk loads; subsequent opens reuse the cached module.
    const sceneModule = (await import('./scene.js')) as {
        initScene: (opts: Record<string, unknown>) => SceneController;
    };
    controller = sceneModule.initScene({
        canvas: canvasRef.value,
        container: containerRef.value,
        tooltip: tooltipRef.value,
        infoPanel: infoPanelRef.value,
        branchDisplay: branchRef.value,
        statusDisplay: statusRef.value,
        fpsDisplay: fpsRef.value,
        lastUpdateDisplay: lastUpdateRef.value,
        onInteraction: () => {
            // Arc 1 has no consumer for structure clicks. The seam stays
            // wired so a future arc can dispatch a scientist into the
            // clicked experiment without touching the lifted engine.
        },
    });
    // Push the current state immediately so the scene renders on mount.
    controller.setState(holotable.legacyState.value);
    // Reactively re-push when the composable's state changes.
    unwatchState = watch(
        () => holotable.legacyState.value,
        (next) => {
            if (controller) {
                controller.setState(next);
            }
        },
        {deep: true},
    );
});

onBeforeUnmount(() => {
    if (unwatchState) {
        unwatchState();
        unwatchState = null;
    }
    if (controller) {
        controller.destroy();
        controller = null;
    }
});

// The panel toggles `pauseRaf`/`resumeRaf` through defineExpose so the
// host can pause the loop when the panel closes (without unmounting this
// component, which would discard the WebGL context).
function pauseRaf(): void {
    if (controller) controller.pauseRaf();
}
function resumeRaf(): void {
    if (controller) controller.resumeRaf();
}
defineExpose({pauseRaf, resumeRaf});
</script>

<template>
    <div ref="containerRef" class="relative w-full h-full bg-mz-canvas overflow-hidden">
        <canvas ref="canvasRef" class="absolute inset-0 w-full h-full block"></canvas>
        <!-- Header chrome: branch + status + last-update + FPS read from the scene -->
        <div
            class="absolute top-3 left-4 right-4 z-10 flex items-center justify-between text-mz-text-faint font-mono text-xs tracking-wide pointer-events-none"
        >
            <div class="flex items-center gap-3">
                <span class="mz-stamp-label">branch</span>
                <span ref="branchRef" class="text-mz-text-mute">--</span>
            </div>
            <div class="flex items-center gap-3">
                <span ref="statusRef" class="text-mz-text-mute">Initializing...</span>
                <span ref="lastUpdateRef" class="text-mz-text-faint"></span>
                <span ref="fpsRef" class="text-mz-text-faint"></span>
            </div>
        </div>
        <!-- Hover tooltip (positioned by the scene via inline style) -->
        <div
            ref="tooltipRef"
            class="absolute z-20 pointer-events-none bg-mz-rail border border-mz-edge px-3 py-2 text-xs text-mz-text shadow-balcony"
            style="display: none; left: 0; top: 0"
        ></div>
        <!-- Info panel (shown when a structure is clicked) -->
        <div
            ref="infoPanelRef"
            class="absolute z-20 right-4 top-12 bg-mz-rail/95 border border-mz-edge px-4 py-3 text-xs text-mz-text shadow-balcony min-w-[220px] max-w-[280px]"
            style="display: none"
        ></div>
    </div>
</template>

<style scoped>
:deep(.panel-row) {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0;
    border-bottom: 1px solid rgba(54, 61, 71, 0.4);
}
:deep(.panel-row:last-child) {
    border-bottom: none;
}
:deep(.panel-label) {
    color: #5b6470;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 9px;
}
:deep(.panel-value) {
    color: #e2e5e9;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
}
:deep(.panel-action) {
    margin-top: 8px;
    width: 100%;
    background: transparent;
    border: 1px solid #2a3038;
    color: #9098a4;
    padding: 6px 10px;
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
        border-color 0.1s,
        color 0.1s;
}
:deep(.panel-action:hover) {
    border-color: #d4a24c;
    color: #e2e5e9;
}
</style>
