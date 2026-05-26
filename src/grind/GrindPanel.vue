<script setup lang="ts">
import {computed, ref, watch} from 'vue';

import {useShell} from '../shell/useShell';
import GrindHud from './GrindHud.vue';
import GrindRenderer from './GrindRenderer.vue';
import {useGrind} from './useGrind';

const shell = useShell();
const grind = useGrind();
const rendererRef = ref<InstanceType<typeof GrindRenderer> | null>(null);

const open = computed(() => shell.openPanel.value === 'grind');

// When the panel opens: ensure the singleton is started (idempotent),
// resume the renderer's RAF. When it closes: pause the RAF. The economy
// keeps ticking — the listener and the autosave never sleep.
watch(open, (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
        void grind.start();
        void Promise.resolve().then(() => rendererRef.value?.resumeRaf());
    } else if (!isOpen && wasOpen) {
        rendererRef.value?.pauseRaf();
    }
});

function onClose(): void {
    shell.closePanel();
}

function onSave(): void {
    void grind.save();
}
</script>

<template>
    <transition name="mz-grind-slide">
        <section
            v-show="open"
            data-grind-panel
            class="absolute inset-x-0 top-11 z-20 bg-mz-panel/95 backdrop-blur border-b border-mz-edge shadow-balcony flex flex-col"
            style="height: 70vh"
            role="dialog"
            aria-label="The Grind"
        >
            <header class="flex items-center justify-between px-6 py-3 border-b border-mz-edge-soft">
                <div class="flex items-center gap-4">
                    <div>
                        <div class="mz-stamp-label">Grind</div>
                        <h2 class="font-display text-mz-text text-base tracking-wide">
                            The lab earns, not the investor
                        </h2>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="mz-button" aria-label="Save the grind state" @click="onSave">
                        Save
                    </button>
                    <button type="button" class="mz-button-icon" aria-label="Close the grind" @click="onClose">
                        ✕
                    </button>
                </div>
            </header>

            <div class="flex flex-1 min-h-0">
                <div class="w-[480px] flex-shrink-0 border-r border-mz-edge-soft">
                    <GrindRenderer ref="rendererRef" />
                </div>
                <div class="flex-1 min-w-0 relative">
                    <GrindHud />
                </div>
            </div>
        </section>
    </transition>
</template>

<style>
.mz-grind-slide-enter-active,
.mz-grind-slide-leave-active {
    transition:
        transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        opacity 220ms ease;
}
.mz-grind-slide-enter-from,
.mz-grind-slide-leave-to {
    transform: translateY(-12px);
    opacity: 0;
}
</style>
