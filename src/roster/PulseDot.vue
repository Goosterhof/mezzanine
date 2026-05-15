<script setup lang="ts">
import {computed} from 'vue';

import type {MissionState} from './types';

interface Props {
    state: MissionState;
    idleWarning?: boolean;
}

const {state, idleWarning = false} = defineProps<Props>();

const classes = computed(() => {
    switch (state) {
        case 'working':
            return 'bg-mz-pulse-working animate-[mz-pulse-working_1.4s_ease-in-out_infinite] shadow-pulse';
        case 'awaiting':
            return 'bg-mz-pulse-awaiting';
        case 'crashed':
            return 'bg-mz-pulse-crashed';
        case 'done':
            return 'bg-mz-pulse-flash';
        case 'idle':
            return idleWarning ? 'bg-mz-signal' : 'bg-mz-pulse-idle';
        default: {
            const _exhaustive: never = state;
            throw new Error(`unreachable mission state: ${String(_exhaustive)}`);
        }
    }
});
</script>

<template>
    <span
        class="inline-block w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-150"
        :class="classes"
        :data-state="state"
        :data-idle-warning="idleWarning ? 'true' : 'false'"
        :aria-label="`scientist state: ${state}`"
    ></span>
</template>
