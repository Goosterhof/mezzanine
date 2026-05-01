<script setup lang="ts">
import {computed} from 'vue';

import type {SessionState} from './types';

const {state} = defineProps<{state: SessionState}>();

const dotStyle = computed<string>(() => {
    switch (state) {
        case 'idle':
            return 'bg-wb-pulse-idle';
        case 'awaiting':
            return 'bg-wb-pulse-awaiting shadow-pulse';
        case 'working':
            return 'bg-wb-pulse-working animate-pulse-working';
        case 'completed-unseen':
            return 'bg-wb-pulse-flash animate-pulse-flash';
        case 'crashed':
            return 'bg-wb-pulse-crashed';
    }
});
</script>

<template>
    <span class="w-2 h-2 rounded-full transition-colors duration-200" :class="dotStyle" />
</template>

<style scoped>
.animate-pulse-working {
    animation: wb-pulse-working 1.6s ease-in-out infinite;
}
.animate-pulse-flash {
    animation: wb-pulse-flash 1.2s ease-out forwards;
}
</style>
