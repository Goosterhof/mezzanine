<script setup lang="ts">
import {computed, ref} from 'vue';

import type {ScientistId} from './types';

import RecentlyRecalledStrip from './RecentlyRecalledStrip.vue';
import ScientistRow from './ScientistRow.vue';
import {useRoster} from './useRoster';

const roster = useRoster();
const listRef = ref<HTMLDivElement | null>(null);

const sortedScientists = computed(() =>
    [...roster.scientists.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
);
const isEmpty = computed(() => roster.scientists.value.length === 0);
const hasRecalledStrip = computed(() => roster.recalledStrip.value.length > 0);

// Net-new in Arc 2 (#00052): the Observer's sprite-click flow updates
// `useRoster.selected`, and the App.vue watcher fans the selection out
// to this method so the matching row scrolls into view. The data-attr
// selector lets us reach the row without a Vue ref per row (which
// would balloon for large rosters).
function scrollToRow(id: ScientistId): void {
    if (!listRef.value) return;
    const row = listRef.value.querySelector<HTMLElement>(`[data-scientist-id="${id}"]`);
    if (row) {
        row.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }
}

defineExpose({scrollToRow});
</script>

<template>
    <aside class="w-80 flex-shrink-0 border-r border-mz-edge-soft bg-mz-rail flex flex-col overflow-hidden" data-roster>
        <header class="px-4 pt-4 pb-2 flex-shrink-0">
            <div class="mz-stamp-label">Roster</div>
            <p v-if="isEmpty" class="text-mz-text-faint font-display text-sm mt-2" data-roster-empty>
                Balcony quiet. No scientists dispatched.
            </p>
        </header>

        <div v-if="!isEmpty" ref="listRef" class="flex-1 overflow-y-auto" data-roster-list>
            <ScientistRow v-for="s in sortedScientists" :key="s.id" :scientist="s" :data-scientist-id="s.id" />
        </div>

        <RecentlyRecalledStrip v-if="hasRecalledStrip" data-recalled-strip />
    </aside>
</template>
