<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';

import {colleagueLabel} from '../roster/types';
import {useRoster} from '../roster/useRoster';
import {useRosterBackend} from '../roster/useRosterBackend';
import {useCommandDraft} from './useCommandDraft';
import {useLastKeystroke} from './useLastKeystroke';

const {draft: input} = useCommandDraft();
const sending = ref(false);
const error = ref<string | null>(null);
const draftRows = computed(() => Math.min(6, input.value.split('\n').length));
const fieldRef = ref<HTMLTextAreaElement | null>(null);

const roster = useRoster();
const backend = useRosterBackend();
const keystrokes = useLastKeystroke();
const recipient = computed(() => {
    const colleague = roster.selectedScientist.value?.colleague;
    return colleague ? colleagueLabel(colleague) : 'Selected scientist';
});

onMounted(() => {
    fieldRef.value?.focus();
});

async function dispatch(): Promise<void> {
    if (sending.value) return;
    const text = input.value;
    if (text.length === 0) {
        return;
    }
    const target = roster.selected.value;
    if (target === null) {
        return;
    }
    input.value = '';
    sending.value = true;
    error.value = null;
    try {
        await backend.writeInput(target, text.includes('\n') ? `\x1b[200~${text}\x1b[201~\r` : `${text}\r`);
    } catch (e) {
        input.value = [text, input.value].filter(Boolean).join('\n\n');
        error.value = String(e);
    } finally {
        sending.value = false;
    }
}
</script>

<template>
    <footer
        class="min-h-12 py-2 flex-shrink-0 border-t border-mz-edge bg-mz-command flex items-center px-6 shadow-tray"
        data-command-bar
    >
        <span class="mz-stamp-label mr-3">Direct</span>
        <textarea
            ref="fieldRef"
            v-model="input"
            :rows="draftRows"
            class="flex-1 bg-transparent border-none outline-none text-mz-text font-mono text-sm resize-none placeholder:text-mz-text-faint"
            placeholder="Speak to the selected scientist…"
            autocomplete="off"
            spellcheck="false"
            data-command-input
            @keydown="keystrokes.note()"
            @keydown.enter.exact.prevent="dispatch"
        ></textarea>
        <span class="mz-stamp-label ml-4">To: {{ recipient }}</span>
    </footer>
    <p v-if="error" role="alert" class="px-6 py-2 text-sm text-mz-pulse-crashed bg-mz-command">{{ error }}</p>
</template>
