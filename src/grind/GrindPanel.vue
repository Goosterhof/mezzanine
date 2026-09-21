<script setup lang="ts">
import {computed, ref, watch} from 'vue';

import {useShell} from '../shell/useShell';
import GrindHud from './GrindHud.vue';
import GrindRenderer from './GrindRenderer.vue';
import {useGrind} from './useGrind';

const shell = useShell();
const grind = useGrind();

const open = computed(() => shell.page.value === 'grind');

// Mount the renderer on the first visit, then preserve its state while hidden.
const visited = ref(open.value);
watch(
    open,
    (visible) => {
        if (visible) {
            visited.value = true;
            void grind.start();
        }
    },
    {immediate: true},
);

function onSave(): void {
    void grind.save();
}
</script>

<template>
    <section v-show="open" data-page="grind" class="h-full min-h-0 bg-mz-panel flex flex-col" aria-label="The Grind">
        <header class="flex items-center justify-between px-6 py-3 border-b border-mz-edge-soft">
            <div class="flex items-center gap-4">
                <div>
                    <div class="mz-stamp-label">Grind</div>
                    <h2 class="font-display text-mz-text text-base tracking-wide">The lab earns, not the investor</h2>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button type="button" class="mz-button" aria-label="Save the grind state" @click="onSave">Save</button>
            </div>
        </header>

        <div class="flex flex-1 min-h-0">
            <div class="w-[480px] flex-shrink-0 border-r border-mz-edge-soft">
                <GrindRenderer v-if="visited" :active="open" />
            </div>
            <div class="flex-1 min-w-0 relative">
                <GrindHud />
            </div>
        </div>
    </section>
</template>
