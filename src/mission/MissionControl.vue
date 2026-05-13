<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';

import {useShell} from '../shell/useShell';
import ComposeDispatch from './ComposeDispatch.vue';
import MinionsDue from './MinionsDue.vue';
import {useMissionControl} from './useMissionControl';
import VitalSigns from './VitalSigns.vue';
import WarRoomDispatch from './WarRoomDispatch.vue';
import WoundsAtThreshold from './WoundsAtThreshold.vue';

const shell = useShell();
const mc = useMissionControl();

const open = computed(() => shell.openPanel.value === 'mission-control');
const composing = ref(false);

const lastRefreshedLabel = computed(() => {
    const value = mc.lastRefreshedAt.value;
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleTimeString();
});

watch(
    open,
    (isOpen) => {
        if (isOpen) {
            void mc.refresh();
        } else {
            composing.value = false;
        }
    },
    {immediate: true},
);

function handleEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
        return;
    }
    if (!open.value) {
        return;
    }
    if (composing.value) {
        composing.value = false;
        return;
    }
    shell.closePanel();
}

onMounted(() => {
    window.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleEscape);
});
</script>

<template>
    <aside
        v-show="open"
        data-panel="mission-control"
        class="absolute top-11 right-0 bottom-0 w-[28rem] bg-mz-panel border-l border-mz-edge shadow-balcony flex flex-col z-20"
    >
        <header class="flex items-center justify-between px-5 py-3 border-b border-mz-edge flex-shrink-0">
            <div>
                <div class="mz-stamp-label">Panel</div>
                <h2 class="font-display text-mz-text text-base tracking-wide mt-0.5">Mission Control</h2>
            </div>
            <div class="flex items-center gap-2">
                <span
                    v-if="lastRefreshedLabel"
                    class="text-mz-text-faint font-mono text-[11px]"
                    :title="`Last refreshed at ${mc.lastRefreshedAt.value}`"
                >
                    {{ lastRefreshedLabel }}
                </span>
                <button
                    type="button"
                    class="mz-button"
                    data-mc-refresh
                    :disabled="mc.loading.value"
                    @click="mc.refresh()"
                >
                    {{ mc.loading.value ? 'Reading…' : 'Refresh' }}
                </button>
                <button
                    type="button"
                    class="mz-button-icon"
                    aria-label="Close Mission Control"
                    data-mc-close
                    @click="shell.closePanel()"
                >
                    ✕
                </button>
            </div>
        </header>

        <p
            v-if="mc.lastError.value"
            class="px-5 py-2 bg-mz-pulse-crashed/10 border-b border-mz-pulse-crashed/40 text-mz-pulse-crashed font-mono text-[11px]"
        >
            {{ mc.lastError.value }}
        </p>

        <div class="flex-1 overflow-y-auto relative">
            <VitalSigns :signs="mc.vitalSigns.value" />
            <WarRoomDispatch :findings="mc.findings.value" @compose="composing = true" />
            <MinionsDue :signals="mc.signals.value" />
            <WoundsAtThreshold :wounds="mc.wounds.value" />
            <ComposeDispatch v-if="composing" @close="composing = false" />
        </div>
    </aside>
</template>
