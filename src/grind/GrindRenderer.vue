<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch} from 'vue';

import {BUILDINGS} from './gameCore';
import {useGrind} from './useGrind';

// Simplified Canvas 2D pixel-art renderer. The original VS Code Grind
// shipped a 1063-line scene engine with eight animated buildings, a
// wandering scientist character, and a particle system. The Mezzanine
// version preserves the *idea* — a pixel-art lab that grows as the
// investor buys buildings — while staying within the absorption scope.
// Each owned building paints a single 32px tile in a column band; the
// canvas redraws on every gameState update. The full sprite engine is
// shelved as a post-absorption polish task.

const canvasRef = ref<HTMLCanvasElement | null>(null);
const grind = useGrind();

const TILE = 32;
const COLS = 12;
const ROWS = 6;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

let rafHandle: number | null = null;
let paused = false;
let frame = 0;

function tileColor(tier: number): string {
    switch (tier) {
        case 0:
            return '#4ade80';
        case 1:
            return '#3b82f6';
        case 2:
            return '#a855f7';
        case 3:
            return '#d4a24c';
        default:
            return '#9098a4';
    }
}

interface TileDraw {
    ctx: CanvasRenderingContext2D;
    col: number;
    row: number;
    tier: number;
    pulseSeed: number;
}

function drawTile({ctx, col, row, tier, pulseSeed}: TileDraw): void {
    const x = col * TILE;
    const y = row * TILE;
    ctx.fillStyle = tileColor(tier);
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    const pulse = (frame + pulseSeed) % 60;
    if (pulse < 30) {
        ctx.fillStyle = '#e2e5e9';
        ctx.fillRect(x + 6, y + 6, 2, 2);
    }
}

function drawBuildings(ctx: CanvasRenderingContext2D): void {
    let col = 0;
    let row = ROWS - 2;
    const state = grind.gameState.value;
    for (const b of BUILDINGS) {
        const count = state.buildings[b.id];
        for (let i = 0; i < count; i++) {
            if (col >= COLS) {
                col = 0;
                row -= 1;
            }
            if (row < 0) return;
            drawTile({ctx, col, row, tier: b.tier, pulseSeed: i * 7 + b.tier * 11});
            col += 1;
        }
    }
}

function draw(): void {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = '#1f242b';
    ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);

    drawBuildings(ctx);

    if (grind.gameState.value.totalBuildings === 0) {
        ctx.fillStyle = '#363d47';
        ctx.fillRect(WIDTH / 2 - 4, HEIGHT - 14, 8, 8);
    }
}

function loop(): void {
    if (paused) return;
    frame += 1;
    draw();
    rafHandle = requestAnimationFrame(loop);
}

function pauseRaf(): void {
    paused = true;
    if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
    }
}

function resumeRaf(): void {
    if (paused) {
        paused = false;
        rafHandle = requestAnimationFrame(loop);
    }
}

onMounted(() => {
    draw();
    rafHandle = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
    pauseRaf();
});

// Force a redraw whenever the state changes (purchases land).
watch(
    () => grind.gameState.value.totalBuildings,
    () => draw(),
);

defineExpose({pauseRaf, resumeRaf});
</script>

<template>
    <div class="grind-renderer h-full flex items-center justify-center bg-mz-canvas">
        <canvas
            ref="canvasRef"
            :width="WIDTH"
            :height="HEIGHT"
            class="border border-mz-edge"
            style="image-rendering: pixelated; width: 480px; height: 240px"
            data-grind-canvas
        />
    </div>
</template>
