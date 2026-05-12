<script setup lang="ts">
import {computed} from 'vue';

import PulseDot from './PulseDot.vue';
import {targetLabel, type Scientist} from './types';
import {useIdleWarning} from './useIdleWarning';
import {useRoster} from './useRoster';
import {useRosterBackend} from './useRosterBackend';

interface Props {
    scientist: Scientist;
}

const {scientist} = defineProps<Props>();

const roster = useRoster();
const backend = useRosterBackend();
const idleWarning = useIdleWarning();

const isSelected = computed(() => roster.selected.value === scientist.id);
const isIdleWarn = computed(() => idleWarning.isIdleWarning(scientist));

const elapsed = computed(() => {
    const started = Date.parse(scientist.startedAt);
    if (Number.isNaN(started)) {
        return '—';
    }
    const seconds = Math.max(0, Math.floor((idleWarning.now.value - started) / 1000));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ${seconds % 60}s`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
});

const target = computed(() => targetLabel(scientist.target));

function select(): void {
    roster.select(scientist.id);
}

function recall(event: Event): void {
    event.stopPropagation();
    void backend.recall(scientist.id);
}
</script>

<template>
    <div
        role="button"
        :data-scientist-id="scientist.id"
        :data-selected="isSelected ? 'true' : 'false'"
        :data-idle-warning="isIdleWarn ? 'true' : 'false'"
        class="flex items-center gap-3 px-4 py-2.5 cursor-pointer border-l-2 transition-colors duration-100"
        :class="[
            isSelected
                ? 'bg-mz-edge-soft/60 border-mz-brass text-mz-text'
                : 'border-transparent text-mz-text-mute hover:text-mz-text hover:bg-mz-edge-soft/40',
            isIdleWarn ? 'opacity-70' : '',
        ]"
        @click="select"
    >
        <PulseDot :state="scientist.state" :idle-warning="isIdleWarn" />
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
                <span class="font-display text-sm tracking-wide truncate">{{ target }}</span>
                <span v-if="isIdleWarn" class="mz-stamp-label text-mz-signal" data-idle-warning-label> Idle 1h+ </span>
            </div>
            <div class="font-mono text-xs text-mz-text-faint truncate" data-mission>
                {{ scientist.mission || '—' }}
            </div>
        </div>
        <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <span class="font-mono text-xs text-mz-text-faint" data-elapsed>{{ elapsed }}</span>
            <button
                type="button"
                class="font-display text-[10px] tracking-[0.18em] uppercase text-mz-text-faint hover:text-mz-signal transition-colors"
                data-recall
                @click="recall"
            >
                Recall
            </button>
        </div>
    </div>
</template>
