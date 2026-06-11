<script setup lang="ts">
import {computed} from 'vue';

import {targetLabel} from './types';
import {useIdleWarning} from './useIdleWarning';
import {useRoster} from './useRoster';

const roster = useRoster();
const idleWarning = useIdleWarning();

const entries = computed(() =>
    [...roster.recalledStrip.value].sort((a, b) => b.recalledAt.localeCompare(a.recalledAt)),
);

function recalledAgo(recalledAt: string): string {
    const stamp = Date.parse(recalledAt);
    if (Number.isNaN(stamp)) {
        return '—';
    }
    const seconds = Math.max(0, Math.floor((idleWarning.now.value - stamp) / 1000));
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
}
</script>

<!-- The Overlook (#00057) re-skinned this strip horizontal: plates slid
     off the railing and set aside at its right end. The data + 5-minute
     TTL logic above is untouched — only the geometry rotated. -->
<template>
    <section class="flex items-center gap-3 px-3 border-l border-mz-edge-soft bg-mz-canvas/50 flex-shrink-0">
        <div class="mz-stamp-label flex-shrink-0">Recently Recalled</div>
        <ul class="flex items-center gap-3 my-0 ps-0 list-none">
            <li
                v-for="entry in entries"
                :key="entry.scientist.id"
                :data-recalled-id="entry.scientist.id"
                class="flex items-center gap-2 opacity-50 flex-shrink-0"
            >
                <span class="inline-block w-2 h-2 rounded-full bg-mz-pulse-idle flex-shrink-0"></span>
                <span class="font-display text-xs tracking-wide whitespace-nowrap max-w-32 truncate">
                    {{ targetLabel(entry.scientist.target) }}
                </span>
                <span class="font-mono text-[10px] text-mz-text-faint whitespace-nowrap max-w-32 truncate">
                    {{ entry.scientist.mission || '—' }}
                </span>
                <span class="font-mono text-[10px] text-mz-text-faint flex-shrink-0">
                    {{ recalledAgo(entry.recalledAt) }}
                </span>
            </li>
        </ul>
    </section>
</template>
