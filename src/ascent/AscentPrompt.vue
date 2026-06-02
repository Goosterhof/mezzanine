<script setup lang="ts">
// The Ascent's prompt strip (#00056) — a newer balcony arrives from the floor
// below and asks to be raised. Never silent: the investor descends or stands
// pat (RD-2). The copy is locked to the balcony register (§3) — descend,
// raise, the floor below, the balcony stands. No "download/install/patch" in
// chrome.

import {computed} from 'vue';

import {useAscent} from './useAscent';

const ascent = useAscent();

const headline = computed((): string => {
    switch (ascent.status.value) {
        case 'available':
            return `A newer balcony stands ready — v${ascent.availableVersion.value ?? '?'}. Descend to raise it?`;
        case 'downloading':
            return ascent.isSteppingDown.value
                ? 'Stepping down while the balcony is rebuilt. Back upstairs in a moment.'
                : `Raising the new balcony… ${ascent.downloadPct.value}%`;
        case 'rejected':
            return 'That balcony was not stamped by the laboratory. Refused.';
        case 'error':
            return 'Could not see the floor below. The balcony stands as it is.';
        default:
            // idle + manual check
            return 'Balcony current. Nothing waiting below.';
    }
});

// The signature rejection wears the warning colour; everything else the brass
// of the rail. The rejection line never invites a retry (§3).
const isRejection = computed((): boolean => ascent.status.value === 'rejected');
</script>

<template>
    <Transition name="ascent-rise">
        <section
            v-if="ascent.visible.value"
            :data-ascent-status="ascent.status.value"
            class="fixed bottom-4 right-4 z-50 max-w-md bg-mz-panel border shadow-lg"
            :class="isRejection ? 'border-mz-pulse-crashed' : 'border-mz-brass-dim'"
            role="status"
            aria-live="polite"
        >
            <div class="flex items-start gap-3 px-4 py-3">
                <span
                    class="mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0"
                    :class="isRejection ? 'bg-mz-pulse-crashed' : 'bg-mz-brass'"
                ></span>
                <div class="flex-1 min-w-0">
                    <div class="mz-stamp-label mb-1">The Ascent</div>
                    <p class="font-body text-sm text-mz-text leading-snug">{{ headline }}</p>

                    <!-- An update stands ready: descend or stay upstairs. -->
                    <div v-if="ascent.status.value === 'available'" class="mt-3 flex items-center gap-2">
                        <button
                            type="button"
                            class="mz-button border-mz-brass-dim text-mz-text"
                            @click="ascent.descend()"
                        >
                            Descend
                        </button>
                        <button type="button" class="mz-button" @click="ascent.dismiss()">Stay upstairs</button>
                    </div>

                    <!-- Mid-descent: a thin progress rule, no actions. -->
                    <div
                        v-else-if="ascent.status.value === 'downloading' && !ascent.isSteppingDown.value"
                        class="mt-3 h-1 bg-mz-edge-soft overflow-hidden"
                    >
                        <div
                            class="h-full bg-mz-brass transition-[width] duration-200"
                            :style="{width: `${ascent.downloadPct.value}%`}"
                            data-ascent-progress
                        ></div>
                    </div>

                    <!-- Rejection, error, or the manual "current" line: close it. -->
                    <div
                        v-else-if="
                            ascent.status.value === 'rejected' ||
                            ascent.status.value === 'error' ||
                            ascent.showsCurrent.value
                        "
                        class="mt-3"
                    >
                        <button type="button" class="mz-button" @click="ascent.dismiss()">Dismiss</button>
                    </div>
                </div>
            </div>
        </section>
    </Transition>
</template>

<style scoped>
.ascent-rise-enter-active,
.ascent-rise-leave-active {
    transition:
        transform 0.22s ease,
        opacity 0.22s ease;
}

.ascent-rise-enter-from,
.ascent-rise-leave-to {
    transform: translateY(0.75rem);
    opacity: 0;
}
</style>
