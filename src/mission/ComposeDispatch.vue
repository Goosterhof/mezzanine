<script setup lang="ts">
import {ref} from 'vue';

import type {NewDispatchFinding} from './types';

import {useMissionControl} from './useMissionControl';

const emit = defineEmits<{(e: 'close'): void}>();

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

const TEMPLATE_BODY = `<one paragraph describing the finding>

**Why it matters:** <load-bearing reason in one sentence>
**Recommended fix:** <minimal change that closes the finding>`;

const title = ref('');
const severity = ref<(typeof SEVERITIES)[number]>('Medium');
const location = ref('');
const body = ref(TEMPLATE_BODY);
const submitting = ref(false);
const error = ref<string | null>(null);

async function handleSave(): Promise<void> {
    if (submitting.value) {
        return;
    }
    if (!title.value.trim() || !location.value.trim()) {
        error.value = 'Title and location are required.';
        return;
    }
    submitting.value = true;
    error.value = null;
    try {
        const payload: NewDispatchFinding = {
            title: title.value.trim(),
            severity: severity.value,
            location: location.value.trim(),
            bodyMarkdown: body.value.trim(),
        };
        await useMissionControl().submitDispatch(payload);
        emit('close');
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="absolute inset-0 bg-wb-panel z-10 flex flex-col">
        <header class="flex items-center justify-between px-5 py-3 border-b border-wb-edge">
            <h3 class="wb-stamp-label">Compose Dispatch</h3>
            <button type="button" class="wb-button" data-mc-cancel @click="emit('close')">Cancel</button>
        </header>
        <form class="flex-1 overflow-y-auto px-5 py-4 space-y-3" @submit.prevent="handleSave">
            <label class="block">
                <span class="wb-stamp-label">Finding title</span>
                <input
                    v-model="title"
                    type="text"
                    class="wb-input w-full mt-1"
                    placeholder="One short sentence the General would file"
                />
            </label>
            <label class="block">
                <span class="wb-stamp-label">Severity</span>
                <select v-model="severity" class="wb-input w-full mt-1">
                    <option v-for="value in SEVERITIES" :key="value" :value="value">{{ value }}</option>
                </select>
            </label>
            <label class="block">
                <span class="wb-stamp-label">Location (file or directory)</span>
                <input
                    v-model="location"
                    type="text"
                    class="wb-input w-full mt-1"
                    placeholder="experiments/zmuuzn-strava/CLAUDE.md"
                />
            </label>
            <label class="block">
                <span class="wb-stamp-label">Body markdown</span>
                <textarea v-model="body" rows="10" class="wb-input w-full mt-1 leading-relaxed" />
            </label>
            <p v-if="error" class="text-wb-pulse-crashed font-display text-xs">{{ error }}</p>
            <div class="flex justify-end pt-2">
                <button type="submit" class="wb-button border-wb-brass text-wb-brass" :disabled="submitting">
                    {{ submitting ? 'Filing…' : 'File Dispatch' }}
                </button>
            </div>
        </form>
    </div>
</template>
