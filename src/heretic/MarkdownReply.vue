<script setup lang="ts">
import {openUrl} from '@tauri-apps/plugin-opener';
import {computed, ref} from 'vue';

import {isWebReference, renderMarkdown} from './markdown';

const {text} = defineProps<{text: string}>();
const html = computed(() => renderMarkdown(text));
const feedback = ref('');

async function copyCode(button: Element): Promise<void> {
    const code = button.closest('.graphite-code')?.querySelector('code')?.textContent ?? '';
    try {
        await navigator.clipboard.writeText(code);
        feedback.value = 'Code copied.';
    } catch {
        feedback.value = 'Could not copy. You can select the code and copy it from the menu.';
    }
}

async function activate(event: MouseEvent): Promise<void> {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const copy = target.closest('[data-copy-code]');
    if (copy) {
        await copyCode(copy);
        return;
    }
    const link = target.closest('a');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    if (!isWebReference(href)) return;
    try {
        await openUrl(href);
    } catch {
        feedback.value = 'Could not open the link. Select and copy its address to try in your browser.';
    }
}
</script>

<template>
    <div class="graphite-markdown" @click="activate">
        <!-- Raw HTML is disabled, URLs are restricted, code is escaped before highlighting. -->
        <div v-html="html"></div>
        <p v-if="feedback" class="graphite-feedback" role="status">{{ feedback }}</p>
    </div>
</template>
