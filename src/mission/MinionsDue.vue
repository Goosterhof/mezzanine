<script setup lang="ts">
import type {MinionSignal} from './types';

// Destructured for the war-room canonical lint rule; values are reactive
// in Vue 3.5+ so the rest of the template reads them as plain refs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {signals} = defineProps<{signals: MinionSignal[]}>();
</script>

<template>
    <section class="px-5 py-4 border-b border-wb-edge-soft">
        <h3 class="wb-stamp-label mb-3">Minions Due for Invocation</h3>
        <div v-if="signals.length === 0" class="text-wb-text-faint text-sm font-display py-2">
            All minions recently active.
        </div>
        <ul v-else class="space-y-2">
            <li
                v-for="(signal, idx) in signals"
                :key="`${signal.date}-${idx}`"
                class="bg-wb-canvas border border-wb-edge px-3 py-2"
            >
                <div class="flex items-center gap-2 mb-1">
                    <span class="wb-stamp-label text-[9px]">{{ signal.date }}</span>
                    <span class="font-display text-xs text-wb-brass uppercase tracking-wider">
                        {{ signal.signalType }}
                    </span>
                    <span class="text-wb-text-faint font-mono text-[11px]">→ {{ signal.target }}</span>
                </div>
                <p class="font-display text-xs text-wb-text leading-snug">{{ signal.message }}</p>
                <p v-if="signal.recommendedDispatch" class="font-mono text-[11px] text-wb-text-mute mt-1">
                    {{ signal.recommendedDispatch }}
                </p>
            </li>
        </ul>
    </section>
</template>
