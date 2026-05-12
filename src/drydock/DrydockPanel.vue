<script setup lang="ts">
import {computed, onMounted, onUnmounted, watch} from 'vue';

import {useShell} from '../shell/useShell';
import PrCard from './PrCard.vue';
import {useDrydock} from './useDrydock';

const shell = useShell();
const drydock = useDrydock();

const open = computed(() => shell.openPanel.value === 'drydock');

const lastRefreshedLabel = computed(() => {
    const value = drydock.lastRefreshedAt.value;
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
            void drydock.refresh();
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
        data-panel="drydock"
        class="absolute top-11 right-0 bottom-0 w-[32rem] bg-mz-panel border-l border-mz-edge shadow-balcony flex flex-col z-20"
    >
        <header class="flex items-center justify-between px-5 py-3 border-b border-mz-edge flex-shrink-0">
            <div>
                <div class="mz-stamp-label">Panel</div>
                <h2 class="font-display text-mz-text text-base tracking-wide mt-0.5">Drydock</h2>
            </div>
            <div class="flex items-center gap-2">
                <span
                    v-if="lastRefreshedLabel"
                    class="text-mz-text-faint font-mono text-[11px]"
                    :title="`Last refreshed at ${drydock.lastRefreshedAt.value}`"
                >
                    {{ lastRefreshedLabel }}
                </span>
                <button
                    type="button"
                    class="mz-button"
                    data-test="drydock-refresh"
                    :disabled="drydock.loading.value"
                    @click="drydock.refresh()"
                >
                    {{ drydock.loading.value ? 'Reading…' : 'Refresh' }}
                </button>
            </div>
        </header>

        <p
            v-if="drydock.lastError.value"
            class="px-5 py-2 bg-mz-pulse-crashed/10 border-b border-mz-pulse-crashed/40 text-mz-pulse-crashed font-mono text-[11px]"
            data-test="drydock-error"
        >
            {{ drydock.lastError.value }}
        </p>

        <div class="flex-1 overflow-y-auto relative">
            <div
                v-if="drydock.auth.value && !drydock.auth.value.authenticated"
                class="px-5 py-6 text-center"
                data-test="drydock-unauth"
            >
                <p class="text-mz-text-faint font-mono text-[12px] italic">
                    gh CLI not authenticated. Run
                    <code class="text-mz-brass">gh auth login</code>
                    in a terminal.
                </p>
            </div>
            <div
                v-else-if="!drydock.loading.value && drydock.prs.value.length === 0"
                class="px-5 py-6 text-center"
                data-test="drydock-empty"
            >
                <p class="text-mz-text-faint font-mono text-[12px] italic">
                    No open PRs across the laboratory. Clean slate.
                </p>
            </div>
            <PrCard v-for="pr in drydock.prs.value" :key="`${pr.repoFullName}#${pr.number}`" :pr="pr" />
        </div>
    </aside>
</template>
