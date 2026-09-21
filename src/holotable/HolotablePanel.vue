<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';

import {useShell} from '../shell/useShell';
import HolotableScene from './HolotableScene.vue';
import {useHolotable} from './useHolotable';

const shell = useShell();
const holotable = useHolotable();

const open = computed(() => shell.page.value === 'holotable');

const errorCopy = computed<string | null>(() => {
    const err = holotable.lastError.value;
    if (!err) return null;
    if (err.kind === 'pre-wizard') {
        return 'The floor cannot be mapped yet. Complete the wizard to point the balcony at the laboratory.';
    }
    return 'The floor is dark. WSL2 may be unavailable — check the bridge and refresh.';
});

// Mount the renderer on the first visit, then preserve its state while hidden.
const visited = ref(open.value);
watch(
    open,
    (visible) => {
        if (visible) {
            visited.value = true;
            void holotable.refresh();
        }
    },
    {immediate: true},
);

function onRefresh(): void {
    void holotable.refresh();
}

onBeforeUnmount(() => {
    holotable.reset();
});
</script>

<template>
    <section
        v-show="open"
        data-page="holotable"
        class="h-full min-h-0 bg-mz-panel flex flex-col"
        aria-label="The Holotable"
    >
        <header class="flex items-center justify-between px-6 py-3 border-b border-mz-edge-soft">
            <div class="flex items-center gap-4">
                <div>
                    <div class="mz-stamp-label">Holotable</div>
                    <h2 class="font-display text-mz-text text-base tracking-wide">The lab floor below</h2>
                </div>
                <span v-if="holotable.isLoading.value" class="mz-stamp-label text-mz-brass animate-pulse">
                    reading the floor...
                </span>
            </div>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="mz-button"
                    :disabled="holotable.isLoading.value"
                    aria-label="Refresh the floor"
                    @click="onRefresh"
                >
                    Refresh
                </button>
            </div>
        </header>
        <div class="relative flex-1 min-h-0">
            <!-- Preserve the WebGL context between visits; active gates its RAF. -->
            <HolotableScene v-if="visited" :active="open" />
            <div
                v-if="errorCopy"
                class="absolute inset-x-6 top-6 z-30 bg-mz-canvas/95 border border-mz-pulse-crashed/40 px-5 py-4 text-mz-text shadow-balcony"
                role="alert"
            >
                <div class="mz-stamp-label text-mz-pulse-crashed">Floor unmappable</div>
                <p class="mt-2 text-sm">{{ errorCopy }}</p>
                <details v-if="holotable.lastError.value" class="mt-3 text-xs text-mz-text-faint">
                    <summary class="cursor-pointer hover:text-mz-text-mute">What the bridge said</summary>
                    <pre class="mt-2 font-mono text-[11px] whitespace-pre-wrap break-words">{{
                        holotable.lastError.value.message
                    }}</pre>
                </details>
            </div>
        </div>
    </section>
</template>
