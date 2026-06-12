<script setup lang="ts">
// TornPaperEdge — the seam between the storeys (#00059 J-4).
//
// The brass railing holds the page; the paper tears away below it. A
// static SVG zigzag whose fill IS the page — imported from the pen so
// the torn edge and the canvas paper share one definition and cannot
// drift apart (§10 divergence #6). Decorative chrome, aria-hidden; the
// pencil plumb-line in RailingDivider renders ABOVE this edge — the
// line hangs over the page, never under it.
//
// Cross-slice constant import blessed in #00059 §6: colour truth lives
// with the renderer; constants cross the boundary, logic does not.

import {PAPER} from '../observer/pen';
</script>

<template>
    <div class="relative flex-shrink-0 h-2 z-[5] pointer-events-none" data-torn-paper-edge aria-hidden="true">
        <svg class="absolute inset-0 w-full h-full" viewBox="0 0 1200 16" preserveAspectRatio="none" aria-hidden="true">
            <path
                d="M0,16 L0,9 L38,5 L74,11 L126,4 L171,10 L224,6 L266,12 L321,5 L378,9 L420,4 L483,11 L530,6 L584,10 L642,4 L701,9 L744,5 L806,11 L853,6 L911,10 L962,4 L1018,9 L1066,5 L1124,11 L1163,6 L1200,9 L1200,16 Z"
                :fill="PAPER"
                data-torn-paper-fill
            />
        </svg>
    </div>
</template>
