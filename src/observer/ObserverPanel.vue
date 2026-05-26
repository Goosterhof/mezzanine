<script setup lang="ts">
import {computed, ref, watch} from 'vue';

import {useShell} from '../shell/useShell';
import LabScene from './LabScene.vue';

const shell = useShell();
const sceneRef = ref<InstanceType<typeof LabScene> | null>(null);

const open = computed(() => shell.openPanel.value === 'observer');

// When the panel opens: resume the RAF loop so the floor animates.
// When it closes: pause the loop so the canvas stops burning CPU
// behind a hidden surface. The chronicle subscription continues — the
// Observer is push-always; only the rendering is panel-gated.
watch(open, (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
        void Promise.resolve().then(() => sceneRef.value?.resumeRaf());
    } else if (!isOpen && wasOpen) {
        sceneRef.value?.pauseRaf();
    }
});

function onClose(): void {
    shell.closePanel();
}
</script>

<template>
    <transition name="mz-observer-slide">
        <section
            v-show="open"
            data-observer-panel
            class="absolute inset-x-0 top-11 z-20 bg-mz-panel/95 backdrop-blur border-b border-mz-edge shadow-balcony"
            style="height: 70vh"
            role="dialog"
            aria-label="The Observer"
        >
            <header class="flex items-center justify-between px-6 py-3 border-b border-mz-edge-soft">
                <div class="flex items-center gap-4">
                    <div>
                        <div class="mz-stamp-label">Observer</div>
                        <h2 class="font-display text-mz-text text-base tracking-wide">
                            The scientists on the floor below
                        </h2>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="mz-button-icon" aria-label="Close the floor" @click="onClose">
                        ✕
                    </button>
                </div>
            </header>
            <div class="relative flex-1 h-[calc(70vh-3.5rem)]">
                <LabScene ref="sceneRef" />
            </div>
        </section>
    </transition>
</template>

<style>
.mz-observer-slide-enter-active,
.mz-observer-slide-leave-active {
    transition:
        transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        opacity 220ms ease;
}
.mz-observer-slide-enter-from,
.mz-observer-slide-leave-to {
    transform: translateY(-12px);
    opacity: 0;
}
</style>
