<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';

import {useShell} from '../shell/useShell';
import HolotableScene from './HolotableScene.vue';
import {useHolotable} from './useHolotable';

const shell = useShell();
const holotable = useHolotable();
const sceneRef = ref<InstanceType<typeof HolotableScene> | null>(null);

const open = computed(() => shell.openPanel.value === 'holotable');

const errorCopy = computed<string | null>(() => {
    const err = holotable.lastError.value;
    if (!err) return null;
    if (err.kind === 'pre-wizard') {
        return 'The floor cannot be mapped yet. Complete the wizard to point the balcony at the laboratory.';
    }
    return 'The floor is dark. WSL2 may be unavailable — check the bridge and refresh.';
});

// When the panel transitions to open: refresh the state and resume the
// RAF loop (the scene component is kept mounted between opens via v-show,
// so its WebGL context survives). When it transitions to closed: pause
// the RAF so the canvas does not burn CPU under a hidden surface.
watch(open, (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
        void holotable.refresh();
        // Defer one tick so the scene's onMounted has resolved on first open.
        void Promise.resolve().then(() => sceneRef.value?.resumeRaf());
    } else if (!isOpen && wasOpen) {
        sceneRef.value?.pauseRaf();
    }
});

function onRefresh(): void {
    void holotable.refresh();
}

function onClose(): void {
    shell.closePanel();
}

onBeforeUnmount(() => {
    holotable.reset();
});
</script>

<template>
    <transition name="mz-holotable-slide">
        <section
            v-show="open"
            data-holotable-panel
            class="absolute inset-x-0 top-19 z-20 bg-mz-panel/95 backdrop-blur border-b border-mz-edge shadow-balcony"
            style="height: 70vh"
            role="dialog"
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
                    <button type="button" class="mz-button-icon" aria-label="Close the floor" @click="onClose">
                        ✕
                    </button>
                </div>
            </header>
            <div class="relative flex-1 h-[calc(70vh-3.5rem)]">
                <!-- Keep the scene mounted between opens so the WebGL context
                     survives. Visibility is controlled by the panel; the
                     RAF loop is paused/resumed in the watcher above. -->
                <HolotableScene ref="sceneRef" />
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
    </transition>
</template>

<style>
.mz-holotable-slide-enter-active,
.mz-holotable-slide-leave-active {
    transition:
        transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1),
        opacity 220ms ease;
}
.mz-holotable-slide-enter-from,
.mz-holotable-slide-leave-to {
    transform: translateY(-12px);
    opacity: 0;
}
</style>
