<script setup lang="ts">
import {computed} from 'vue';

import RecentlyRecalledStrip from './RecentlyRecalledStrip.vue';
import ScientistRow from './ScientistRow.vue';
import {useRoster} from './useRoster';

const roster = useRoster();

const sortedScientists = computed(() =>
    [...roster.scientists.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
);
const isEmpty = computed(() => roster.scientists.value.length === 0);
const hasRecalledStrip = computed(() => roster.recalledStrip.value.length > 0);
</script>

<template>
    <aside class="w-80 flex-shrink-0 border-r border-mz-edge-soft bg-mz-rail flex flex-col overflow-hidden" data-roster>
        <header class="px-4 pt-4 pb-2 flex-shrink-0">
            <div class="mz-stamp-label">Roster</div>
            <p v-if="isEmpty" class="text-mz-text-faint font-display text-sm mt-2" data-roster-empty>
                Balcony quiet. No scientists dispatched.
            </p>
        </header>

        <div v-if="!isEmpty" class="flex-1 overflow-y-auto" data-roster-list>
            <ScientistRow v-for="s in sortedScientists" :key="s.id" :scientist="s" />
        </div>

        <RecentlyRecalledStrip v-if="hasRecalledStrip" data-recalled-strip />
    </aside>
</template>
