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

<template>
    <section class="border-t border-mz-edge-soft bg-mz-canvas/50 flex-shrink-0">
        <header class="px-4 pt-3 pb-1">
            <div class="mz-stamp-label">Recently Recalled</div>
        </header>
        <ul class="px-4 pb-3 space-y-1.5">
            <li
                v-for="entry in entries"
                :key="entry.scientist.id"
                :data-recalled-id="entry.scientist.id"
                class="flex items-center gap-3 opacity-50"
            >
                <span class="inline-block w-2 h-2 rounded-full bg-mz-pulse-idle flex-shrink-0"></span>
                <div class="flex-1 min-w-0">
                    <div class="font-display text-xs tracking-wide truncate">
                        {{ targetLabel(entry.scientist.target) }}
                    </div>
                    <div class="font-mono text-[10px] text-mz-text-faint truncate">
                        {{ entry.scientist.mission || '—' }}
                    </div>
                </div>
                <span class="font-mono text-[10px] text-mz-text-faint flex-shrink-0">
                    {{ recalledAgo(entry.recalledAt) }}
                </span>
            </li>
        </ul>
    </section>
</template>
