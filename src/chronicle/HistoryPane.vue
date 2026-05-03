<script setup lang="ts">
import {computed, onMounted, onUnmounted} from 'vue';

import {EXPERIMENTS} from '../session/types';
import {useHistory} from './useHistory';

const history = useHistory();

const experimentLabel = computed(() => {
    const id = history.experiment.value;
    if (id === null) {
        return null;
    }
    return EXPERIMENTS.find((e) => e.id === id)?.label ?? null;
});

const formattedTurns = computed(() =>
    history.turns.value.map((turn, idx) => ({
        key: idx,
        direction: turn.direction,
        payload: turn.payload,
        time: formatTime(turn.ts),
    })),
);

function formatTime(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
        return iso;
    }
    const date = parsed.toISOString().slice(0, 10);
    const time = parsed.toISOString().slice(11, 19);
    return `${date} ${time}`;
}

function handleEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
        return;
    }
    if (!history.open.value) {
        return;
    }
    history.close();
}

onMounted(() => {
    window.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleEscape);
});
</script>

<template>
    <div v-if="history.open.value" data-pane="history" class="absolute inset-0 bg-wb-canvas z-30 flex flex-col">
        <header class="flex items-center justify-between px-6 py-3 border-b border-wb-edge flex-shrink-0">
            <div>
                <div class="wb-stamp-label">Chronicle — last 7 days</div>
                <h2 class="font-display text-wb-text text-base tracking-wide mt-0.5">
                    {{ experimentLabel ?? 'No bench selected' }}
                </h2>
            </div>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="wb-button"
                    data-history-refresh
                    :disabled="history.loading.value"
                    @click="history.refresh()"
                >
                    {{ history.loading.value ? 'Reading…' : 'Refresh' }}
                </button>
                <button type="button" class="wb-button" data-history-close @click="history.close()">Close</button>
            </div>
        </header>

        <p
            v-if="history.lastError.value"
            class="px-6 py-2 bg-wb-pulse-crashed/10 border-b border-wb-pulse-crashed/40 text-wb-pulse-crashed font-mono text-[11px]"
        >
            {{ history.lastError.value }}
        </p>

        <div v-if="formattedTurns.length === 0" class="flex-1 flex items-center justify-center">
            <div class="text-center max-w-md">
                <div class="wb-stamp-label mb-3">Chronicle empty</div>
                <p class="text-wb-text-mute font-display text-sm">
                    No transcripts yet. Start a session to begin the record.
                </p>
            </div>
        </div>

        <div v-else class="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs text-wb-stamp">
            <article
                v-for="turn in formattedTurns"
                :key="turn.key"
                class="mb-3 pb-3 border-b border-wb-edge-soft last:border-b-0"
            >
                <header class="flex items-center gap-3 mb-1">
                    <span class="wb-stamp-label text-[9px]">{{ turn.time }}</span>
                    <span
                        class="text-[10px] uppercase tracking-wider font-display border px-2 py-0.5"
                        :class="
                            turn.direction === 'in'
                                ? 'text-wb-brass border-wb-brass'
                                : 'text-wb-pulse-awaiting border-wb-pulse-awaiting'
                        "
                    >
                        {{ turn.direction === 'in' ? 'INPUT' : 'OUTPUT' }}
                    </span>
                </header>
                <pre class="whitespace-pre-wrap break-words leading-relaxed">{{ turn.payload }}</pre>
            </article>
        </div>
    </div>
</template>
