<script setup lang="ts">
// RailingDivider — the brass-post balustrade between the storeys (#00057).
//
// The literal edge the investor leans over: a horizontal brass top-rail
// with posts at regular intervals, `mz-brass` catching the light on one
// side, `mz-brass-dim` falling to shadow on the other. Everywhere along
// its width it holds the two storeys apart — except at exactly one
// column, where the plumb-line pierces it: the selected scientist.
//
// The plumb-line is plumb-true to the sprite's station x (geometry
// resolved 2026-06-12 — §4/§6/§11 of the experiment log agree): the
// selected nameplate's plumb-anchor releases it visually but does not
// tether it. A plumb-line is vertical by definition. No hand drops it;
// the reaction IS the lean.

interface Props {
    /** x-position (px, relative to the divider's left edge) where the
     *  plumb-line drops — the selected sprite's CSS-scale-corrected
     *  station x. `null` = no selection, no line. */
    selectedX?: number | null;
    /** How far the line falls (px) — from the divider down to the
     *  selected sprite on the floor below. */
    dropLength?: number;
    /** True during the ~300ms drop window — drives the draw-on. */
    dropping?: boolean;
}

const {selectedX = null, dropLength = 160, dropping = false} = defineProps<Props>();
</script>

<template>
    <div
        class="relative flex-shrink-0 h-4 bg-mz-rail border-t border-mz-edge-soft"
        data-railing-divider
        aria-hidden="true"
    >
        <!-- The balustrade: brass top-rail + tiled posts, shadow-sided -->
        <svg class="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <defs>
                <pattern id="mz-brass-posts" width="48" height="16" patternUnits="userSpaceOnUse">
                    <rect x="23" y="4" width="2" height="12" fill="#8C6A2F" />
                    <rect x="22" y="4" width="2" height="12" fill="#D4A24C" />
                </pattern>
            </defs>
            <rect x="0" y="2" width="100%" height="2" fill="#D4A24C" data-divider-toprail />
            <rect x="0" y="4" width="100%" height="1" fill="#8C6A2F" />
            <rect x="0" y="5" width="100%" height="11" fill="url(#mz-brass-posts)" />
        </svg>

        <!-- The plumb-line: pierces the divider at exactly one column -->
        <svg
            v-if="selectedX !== null"
            class="absolute top-0 w-px overflow-visible pointer-events-none z-10"
            :style="{left: `${selectedX}px`, height: `${dropLength}px`}"
            data-plumb-line
        >
            <line
                class="plumb-line"
                :class="{dropping}"
                x1="0"
                y1="0"
                x2="0"
                :y2="dropLength"
                stroke="#D4A24C"
                stroke-width="1.5"
                :style="{'--len': `${dropLength}px`}"
            />
            <!-- Attention landing: a faint glow only at the floor end -->
            <circle class="plumb-tip" cx="0" :cy="dropLength" r="2" fill="#D4A24C" />
        </svg>
    </div>
</template>

<style scoped>
.plumb-line {
    stroke-dasharray: var(--len);
    stroke-dashoffset: 0;
}
.plumb-line.dropping {
    animation: mz-plumb-drop 300ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
@keyframes mz-plumb-drop {
    from {
        stroke-dashoffset: var(--len);
    }
    to {
        stroke-dashoffset: 0;
    }
}
.plumb-tip {
    filter: drop-shadow(0 0 4px rgba(212, 162, 76, 0.7));
    animation: mz-plumb-tip-pulse 2.4s ease-in-out infinite;
}
@keyframes mz-plumb-tip-pulse {
    0%,
    100% {
        opacity: 0.9;
    }
    50% {
        opacity: 0.5;
    }
}
/* Reduced motion: the line appears at full length instantly — selection
   is fully expressed as state; motion is enhancement, never the only
   channel. (The global uno.config.ts gate squashes durations too; this
   block makes the draw-on's intent explicit for the plumb-line.) */
@media (prefers-reduced-motion: reduce) {
    .plumb-line.dropping {
        animation: none !important;
        stroke-dashoffset: 0 !important;
    }
    .plumb-tip {
        animation: none !important;
    }
}
</style>
