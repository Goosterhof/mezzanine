<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';

import {colleagueLabel} from '../roster/types';
import {useRoster} from '../roster/useRoster';
import {useRosterBackend} from '../roster/useRosterBackend';

const input = ref('');
const fieldRef = ref<HTMLInputElement | null>(null);

const roster = useRoster();
const backend = useRosterBackend();
const recipient = computed(() => {
    const colleague = roster.selectedScientist.value?.colleague;
    return colleague ? colleagueLabel(colleague) : 'Selected scientist';
});

onMounted(() => {
    fieldRef.value?.focus();
});

async function dispatch(): Promise<void> {
    const text = input.value;
    if (text.length === 0) {
        return;
    }
    const target = roster.selected.value;
    if (target === null) {
        return;
    }
    input.value = '';
    await backend.writeInput(target, `${text}\r`);
}
</script>

<template>
    <footer class="h-12 flex-shrink-0 border-t border-mz-edge bg-mz-command flex items-center px-6 shadow-tray">
        <span class="mz-stamp-label mr-3">Direct</span>
        <input
            ref="fieldRef"
            v-model="input"
            type="text"
            class="flex-1 bg-transparent border-none outline-none text-mz-text font-mono text-sm placeholder:text-mz-text-faint"
            placeholder="Speak to the selected scientist…"
            autocomplete="off"
            spellcheck="false"
            data-command-input
            @keydown.enter.prevent="dispatch"
        />
        <span class="mz-stamp-label ml-4">To: {{ recipient }}</span>
    </footer>
</template>
