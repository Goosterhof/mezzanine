<script setup lang="ts">
import {computed} from 'vue';

import type {SessionState} from './types';

const {state} = defineProps<{state: SessionState}>();

const dotStyle = computed<string>(() => {
    switch (state) {
        case 'idle':
            return 'bg-mz-pulse-idle';
        case 'awaiting':
            return 'bg-mz-pulse-awaiting shadow-pulse';
        case 'working':
            return 'bg-mz-pulse-working animate-pulse-working';
        case 'completed-unseen':
            return 'bg-mz-pulse-flash animate-pulse-flash';
        case 'crashed':
            return 'bg-mz-pulse-crashed';
    }
});
</script>

<template>
    <span class="w-2 h-2 rounded-full transition-colors duration-200" :class="dotStyle" />
</template>

<style scoped>
.animate-pulse-working {
    animation: mz-pulse-working 1.6s ease-in-out infinite;
}
.animate-pulse-flash {
    animation: mz-pulse-flash 1.2s ease-out forwards;
}
</style>
