<script setup lang="ts">
import {openUrl} from '@tauri-apps/plugin-opener';
import {ref} from 'vue';

import {useServiceMonitor} from './useServiceMonitor';

const monitor = useServiceMonitor();
const selected = ref<string | null>(null);
const actionError = ref<string | null>(null);
async function visit(url: string): Promise<void> {
    try {
        await openUrl(url);
    } catch (e) {
        actionError.value = String(e);
    }
}
</script>
<template>
    <aside class="service-list bg-mz-rail border-r border-mz-edge overflow-y-auto p-5">
        <div class="mz-stamp-label">Laboratory apps</div>
        <h3 class="font-display text-xl my-2">The service watch</h3>
        <p class="text-xs text-mz-text-mute mb-5">Checks every minute while the Mezzanine runs.</p>
        <p v-if="monitor.error.value" role="alert" class="text-sm text-mz-signal mb-3">
            Monitor unavailable. {{ monitor.error.value }}
        </p>
        <p v-else-if="monitor.stale.value" class="text-sm text-mz-signal mb-3">
            {{ monitor.checkedAt.value ? 'Last readings are stale.' : 'Waiting for the first measurements…' }}
        </p>
        <button class="mz-button mb-4" :disabled="monitor.loading.value" @click="monitor.refresh()">
            {{ monitor.loading.value ? 'Checking…' : 'Check now' }}
        </button>
        <article v-for="service in monitor.services.value" :key="service.slug" class="border-t border-mz-edge py-4">
            <button
                class="w-full text-left"
                :aria-expanded="selected === service.slug"
                @click="selected = selected === service.slug ? null : service.slug"
            >
                <span class="flex items-center justify-between gap-2"
                    ><strong class="font-display">{{ service.label }}</strong
                    ><span class="health-label" :data-health="monitor.health(service)">{{
                        monitor.health(service) === 'unknown'
                            ? 'Unknown'
                            : service.healthy
                              ? 'Healthy'
                              : service.statusCode === null
                                ? 'Unreachable'
                                : 'Unhealthy'
                    }}</span></span
                >
                <span class="block text-xs text-mz-text-mute mt-2"
                    >{{ service.responseTimeMs }} ms · checked
                    {{ new Date(service.checkedAt).toLocaleTimeString() }}</span
                >
                <span class="flex gap-1 mt-3" aria-label="Recent checks"
                    ><span
                        v-for="sample in service.history"
                        :key="sample.at"
                        class="sample"
                        :class="{'sample-ok': sample.healthy}"
                        :title="`${new Date(sample.at).toLocaleTimeString()}: ${sample.healthy ? 'healthy' : 'failed'}`"
                    ></span
                ></span>
            </button>
            <div v-if="selected === service.slug" class="mt-4 text-xs space-y-3">
                <p class="break-all text-mz-text-mute">{{ service.url }}</p>
                <p>{{ service.statusCode ? `HTTP ${service.statusCode}` : service.error }}</p>
                <p v-if="service.incidentSince">
                    First failed check {{ new Date(service.incidentSince).toLocaleTimeString() }} ·
                    {{ service.failures }} consecutive failures
                </p>
                <button class="mz-button" @click="visit(service.url)">Open health endpoint</button>
            </div>
        </article>
        <p v-if="actionError" role="alert" class="text-mz-pulse-crashed text-xs">{{ actionError }}</p>
        <p class="text-xs text-mz-text-mute mt-5">
            Application health is measured separately from local Git changes. Database and platform health are not
            independently monitored.
        </p>
    </aside>
</template>
<style scoped>
.service-list {
    width: 340px;
    flex-shrink: 0;
}
.health-label {
    font-size: 10px;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 2px 5px;
}
[data-health='green'] {
    color: #8db8a3;
}
[data-health='amber'] {
    color: #d6b26e;
}
[data-health='red'] {
    color: #df8b81;
}
[data-health='unknown'] {
    color: #a3a9b1;
}
.sample {
    width: 8px;
    height: 14px;
    background: #df8b81;
    border-radius: 2px;
}
.sample-ok {
    background: #8db8a3;
}
@media (max-width: 800px) {
    .service-list {
        width: 100%;
    }
}
</style>
