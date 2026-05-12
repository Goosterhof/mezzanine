<script setup lang="ts">
import {computed} from 'vue';

import type {VitalSigns} from './types';

const {signs} = defineProps<{signs: VitalSigns}>();

interface Stat {
    label: string;
    value: number | null;
    summary: string;
}

const stats = computed<Stat[]>(() => [
    {label: 'Experiments', value: signs.experimentsActive, summary: signs.experimentsSummary},
    {label: 'Gadgets', value: signs.gadgetsCalibrated, summary: signs.gadgetsSummary},
    {label: 'Packages', value: signs.packagesPublished, summary: signs.packagesSummary},
    {label: 'Minions', value: signs.minionsOperational, summary: signs.minionsSummary},
    {label: 'Sentinels', value: signs.sentinelsWatching, summary: signs.sentinelsSummary},
]);

const hasAny = computed(() => stats.value.some((s) => s.value !== null));
</script>

<template>
    <section class="px-5 py-4 border-b border-mz-edge-soft">
        <h3 class="mz-stamp-label mb-3">Vital Signs</h3>
        <div v-if="!hasAny" class="text-mz-text-faint text-sm font-display">
            Vital signs unreadable. CLAUDE.md may have moved.
        </div>
        <div v-else class="grid grid-cols-5 gap-3">
            <div v-for="stat in stats" :key="stat.label" class="bg-mz-canvas border border-mz-edge px-3 py-2">
                <div class="mz-stamp-label text-[9px]">{{ stat.label }}</div>
                <div class="font-display text-2xl text-mz-text leading-tight mt-1">
                    {{ stat.value ?? '—' }}
                </div>
            </div>
        </div>
        <p v-if="signs.lastChaos" class="mt-3 text-mz-text-mute font-mono text-xs">
            <span class="mz-stamp-label mr-2">Last Chaos</span>
            <span class="text-mz-stamp">{{ signs.lastChaos }}</span>
        </p>
        <p v-if="signs.chaosFiled" class="mt-1 text-mz-text-faint font-mono text-xs">
            <span class="mz-stamp-label mr-2">Chaos Filed</span>
            <span>{{ signs.chaosFiled }}</span>
        </p>
        <p v-if="signs.enhanceFiled" class="mt-1 text-mz-text-faint font-mono text-xs">
            <span class="mz-stamp-label mr-2">Enhance Filed</span>
            <span>{{ signs.enhanceFiled }}</span>
        </p>
    </section>
</template>
