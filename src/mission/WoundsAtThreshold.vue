<script setup lang="ts">
import {computed} from 'vue';

import type {WoundSummary} from './types';

const {wounds} = defineProps<{wounds: WoundSummary[]}>();

const formatted = computed(() =>
    wounds.map((wound) => ({
        ...wound,
        modifiedLabel: formatModified(wound.modifiedAt),
    })),
);

function formatModified(iso: string): string {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return iso;
    }
    return date.toISOString().slice(0, 10);
}
</script>

<template>
    <section class="px-5 py-4">
        <h3 class="mz-stamp-label mb-3">Wounds at Threshold</h3>
        <div v-if="formatted.length === 0" class="text-mz-text-faint text-sm font-display py-2">
            No wounds at threshold.
        </div>
        <ul v-else class="space-y-1">
            <li
                v-for="wound in formatted"
                :key="wound.filename"
                class="flex items-center justify-between font-mono text-xs text-mz-stamp px-3 py-1.5 bg-mz-canvas border border-mz-edge"
            >
                <span class="truncate">{{ wound.filename }}</span>
                <span class="text-mz-text-faint flex-shrink-0">{{ wound.modifiedLabel }}</span>
            </li>
        </ul>
    </section>
</template>
