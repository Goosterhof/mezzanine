<script setup lang="ts">
// BriefingLibrary — the card grid inside the Dispatch sheet.
//
// Each card represents one mission template. Selecting a card emits
// `select` with the template's id (or `null` if the same card is clicked
// again — a quick way to drop back into pure free-form mode). The card
// shows the template's label + description + a target-shape badge so
// the investor can tell at a glance whether the template will require
// picking an experiment first.

import {computed} from 'vue';

import type {BriefingTemplate, BriefingTargetShape} from './types';

import {useBriefingLibrary} from './useBriefingLibrary';

interface Props {
    selectedId: string | null;
}

const {selectedId} = defineProps<Props>();
const emit = defineEmits<(event: 'select', id: string | null) => void>();

const library = useBriefingLibrary();

const cards = computed<BriefingTemplate[]>(() => library.templates.value);

function shapeBadge(shape: BriefingTargetShape): string {
    return shape === 'per-experiment' ? 'Per Experiment' : 'Lab-Wide';
}

function onClickCard(id: string): void {
    emit('select', selectedId === id ? null : id);
}
</script>

<template>
    <div data-briefing-library class="grid gap-2">
        <div class="mz-stamp-label">Briefing Library</div>
        <p v-if="library.loadError.value" data-briefing-library-error class="text-mz-pulse-crashed text-xs">
            {{ library.loadError.value }}
        </p>
        <p
            v-else-if="!library.loaded.value && cards.length === 0"
            data-briefing-library-loading
            class="text-mz-text-faint text-xs"
        >
            Loading the library…
        </p>
        <p v-else-if="cards.length === 0" class="text-mz-text-faint text-xs">No templates yet.</p>
        <div v-else class="grid gap-1.5 sm:grid-cols-2">
            <button
                v-for="card in cards"
                :key="card.id"
                type="button"
                :data-briefing-template="card.id"
                :data-selected="selectedId === card.id ? 'true' : 'false'"
                class="text-left border px-3 py-2 transition-colors duration-100"
                :class="
                    selectedId === card.id
                        ? 'border-mz-brass bg-mz-edge-soft/60 text-mz-text'
                        : 'border-mz-edge text-mz-text-mute hover:border-mz-rule hover:text-mz-text'
                "
                @click="onClickCard(card.id)"
            >
                <div class="flex items-start justify-between gap-2">
                    <span class="font-display text-sm tracking-wide">{{ card.label }}</span>
                    <span class="mz-stamp-label whitespace-nowrap text-[9px]">{{ shapeBadge(card.targetShape) }}</span>
                </div>
                <p class="text-mz-text-faint text-xs mt-1 leading-snug">{{ card.description }}</p>
            </button>
        </div>
    </div>
</template>
