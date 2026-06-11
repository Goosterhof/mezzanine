<script setup lang="ts">
// RailingNameplate — one brass name-card clipped to the railing (#00057).
//
// The single most important re-skin of the Overlook: the data and
// selection logic of `ScientistRow.vue` survive untouched (`elapsed`,
// `isSelected`, `isIdleWarn`, `select()`, `recall()`, the PulseDot) —
// only the geometry changes, vertical row → horizontal nameplate
// mounted on the rail directly above the scientist's sprite on the
// floor below.
//
// Net-new here (not carried from ScientistRow): the crashed-plate
// treatment. A crashed scientist's plate takes the red pulse dot, a
// hairline crashed border, the failure line in the Mezzanine voice,
// and an always-visible Recall — the plate most in need of notice
// never hides its exit.

import {computed} from 'vue';

import PulseDot from '../roster/PulseDot.vue';
import {targetLabel, type Scientist} from '../roster/types';
import {useIdleWarning} from '../roster/useIdleWarning';
import {useRoster} from '../roster/useRoster';
import {useRosterBackend} from '../roster/useRosterBackend';

interface Props {
    scientist: Scientist;
    /** Heavy-overflow tier: the plate sheds its mission line and shrinks. */
    condensed?: boolean;
}

const {scientist, condensed = false} = defineProps<Props>();

const roster = useRoster();
const backend = useRosterBackend();
const idleWarning = useIdleWarning();

const isSelected = computed(() => roster.selected.value === scientist.id);
const isIdleWarn = computed(() => idleWarning.isIdleWarning(scientist));
const isCrashed = computed(() => scientist.state === 'crashed');

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

const missionLine = computed(() => {
    if (isCrashed.value) {
        return 'Mission ended in failure. Recall to clear.';
    }
    return scientist.mission || '—';
});

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
        :data-crashed="isCrashed ? 'true' : 'false'"
        :aria-label="`${target} — ${missionLine} — ${scientist.state} — ${elapsed}`"
        class="group relative flex-shrink-0 px-3 py-2 cursor-pointer transition-colors duration-100"
        :class="[
            condensed ? 'w-[120px]' : 'w-[200px]',
            isSelected
                ? 'bg-mz-edge-soft/60 text-mz-text'
                : 'text-mz-text-mute hover:text-mz-text hover:bg-mz-edge-soft/40',
            isCrashed
                ? 'border border-mz-pulse-crashed/40'
                : isSelected
                  ? 'border-t-2 border-mz-brass'
                  : 'border-t-2 border-transparent',
            isIdleWarn ? 'opacity-70' : '',
        ]"
        @click="select"
    >
        <div class="flex items-center gap-2">
            <PulseDot :state="scientist.state" :idle-warning="isIdleWarn" />
            <span class="font-display text-sm tracking-wide truncate">{{ target }}</span>
            <span v-if="isIdleWarn" class="mz-stamp-label text-mz-signal ml-auto" data-idle-warning-label>
                Idle 1h+
            </span>
        </div>
        <div v-if="!condensed" class="flex items-center justify-between gap-2 mt-0.5">
            <span class="font-mono text-xs text-mz-text-faint truncate" data-mission>{{ missionLine }}</span>
            <span
                v-if="!isIdleWarn && !isCrashed"
                class="font-mono text-xs text-mz-text-faint flex-shrink-0"
                data-elapsed
            >
                {{ elapsed }}
            </span>
        </div>
        <div v-else-if="!isIdleWarn && !isCrashed" class="font-mono text-xs text-mz-text-faint mt-0.5" data-elapsed>
            {{ elapsed }}
        </div>
        <!-- Recall: hidden by default, revealed on hover or selection — but a crashed
             plate shows it always; failure never hides its exit. -->
        <button
            type="button"
            class="absolute right-2 bottom-1 font-display text-[10px] tracking-[0.18em] uppercase text-mz-text-faint hover:text-mz-signal transition-opacity bg-mz-rail/80"
            :class="isSelected || isCrashed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
            data-recall
            @click="recall"
        >
            Recall
        </button>
        <!-- Plumb anchor (selected only) — marks the release point of the plumb-line.
             The line itself is plumb-true to the sprite's station (RailingDivider). -->
        <span
            v-if="isSelected"
            class="plumb-anchor absolute left-1/2 -bottom-px w-1.5 h-1.5 -translate-x-1/2 bg-mz-brass"
            data-plumb-anchor
            aria-hidden="true"
        ></span>
    </div>
</template>
