<script setup lang="ts">
// PatrolLamp — the amber heartbeat on the Balustrade (#00060, the Gift).
//
// A small pilot light mounted left of the TC glyph. It speaks by presence
// and rhythm, with no text and no tooltip:
//   * `nudging`  — armed AND a real push within the last five minutes:
//     amber, slow 2.4s pulse (mz-patrol-pulse). The reduced-motion
//     preflight in uno.config.ts freezes it to steady amber automatically.
//   * `watching` — armed, no recent push: steady amber, no animation.
//   * `off`      — idle / token-missing: not rendered.
//
// The lamp pulses even while the TC panel is closed — `useCriersWatch`
// drives `lastNudgeAt` from the crier's PTY push lines, not a panel poll,
// so the amber heartbeat ignites on the rail the instant the crier answers.

import {computed} from 'vue';

import type {PatrolLampStatus} from './types';

const {status} = defineProps<{status: PatrolLampStatus}>();

const visible = computed(() => status !== 'off');

const lampClass = computed(() => (status === 'nudging' ? 'animate-[mz-patrol-pulse_2.4s_ease-in-out_infinite]' : ''));
</script>

<template>
    <span
        v-if="visible"
        class="inline-block w-1.5 h-1.5 rounded-full bg-mz-signal flex-shrink-0"
        :class="lampClass"
        :data-patrol-lamp="status"
        aria-hidden="true"
    ></span>
</template>
