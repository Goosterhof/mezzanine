<script setup lang="ts">
import {ref, onMounted} from 'vue';

import {useBackend} from '../session/useBackend';
import {useSessions} from '../session/useSessions';

const input = ref('');
const fieldRef = ref<HTMLInputElement | null>(null);

const sessions = useSessions();
const backend = useBackend();

onMounted(() => {
    fieldRef.value?.focus();
});

async function dispatch(): Promise<void> {
    const text = input.value;
    if (text.length === 0) {
        return;
    }
    const target = sessions.activeExperiment.value;
    if (!target) {
        return;
    }
    input.value = '';
    await backend.writeInput(target, `${text}\n`);
}
</script>

<template>
    <footer class="h-12 border-t border-wb-edge bg-wb-command flex items-center px-6 shadow-tray">
        <span class="wb-stamp-label mr-3">Direct</span>
        <input
            ref="fieldRef"
            v-model="input"
            type="text"
            class="flex-1 bg-transparent border-none outline-none text-wb-text font-mono text-sm placeholder:text-wb-text-faint"
            placeholder="Direct the laboratory…"
            autocomplete="off"
            spellcheck="false"
            @keydown.enter.prevent="dispatch"
        />
        <span class="wb-stamp-label ml-4">@&lt;exp&gt; routes by name</span>
    </footer>
</template>
