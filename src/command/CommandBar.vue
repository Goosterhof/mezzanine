<script setup lang="ts">
import {ref, onMounted} from 'vue';

import {EXPERIMENTS, type ExperimentId} from '../session/types';
import {useBackend} from '../session/useBackend';
import {useSessions} from '../session/useSessions';

const input = ref('');
const fieldRef = ref<HTMLInputElement | null>(null);

const sessions = useSessions();
const backend = useBackend();

onMounted(() => {
    fieldRef.value?.focus();
});

const PREFIX_PATTERN = /^@(\S+)\s+([\s\S]+)$/;
const KNOWN_IDS = new Set<ExperimentId>(EXPERIMENTS.map((exp) => exp.id));

interface ParsedDispatch {
    /** Resolved target if the prefix named a known experiment; null otherwise. */
    target: ExperimentId | null;
    /** What to actually write — the prefix is stripped on a match. */
    payload: string;
}

function parsePrefix(text: string): ParsedDispatch {
    const match = PREFIX_PATTERN.exec(text);
    if (!match) {
        return {target: null, payload: text};
    }
    const candidate = match[1] as ExperimentId;
    if (!KNOWN_IDS.has(candidate)) {
        return {target: null, payload: text};
    }
    return {target: candidate, payload: match[2] ?? ''};
}

async function dispatch(): Promise<void> {
    const text = input.value;
    if (text.length === 0) {
        return;
    }
    const parsed = parsePrefix(text);
    const target = parsed.target ?? sessions.activeExperiment.value;
    if (!target) {
        return;
    }
    input.value = '';
    await backend.writeInput(target, `${parsed.payload}\n`);
}
</script>

<template>
    <footer class="h-12 border-t border-mz-edge bg-mz-command flex items-center px-6 shadow-tray">
        <span class="mz-stamp-label mr-3">Direct</span>
        <input
            ref="fieldRef"
            v-model="input"
            type="text"
            class="flex-1 bg-transparent border-none outline-none text-mz-text font-mono text-sm placeholder:text-mz-text-faint"
            placeholder="Direct the laboratory…"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter.prevent="dispatch"
        />
        <span class="mz-stamp-label ml-4">@&lt;exp&gt; routes by name</span>
    </footer>
</template>
