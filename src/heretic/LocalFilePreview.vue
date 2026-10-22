<script setup lang="ts">
import {invoke} from '@tauri-apps/api/core';
import {onBeforeUnmount, onMounted, ref} from 'vue';

import {imageMime} from './localFiles';

const {path} = defineProps<{path: string}>();
const emit = defineEmits<{close: []}>();
const dialog = ref<HTMLDialogElement | null>(null);
const source = ref('');
const error = ref('');
const busy = ref(false);
const revealing = ref(false);
const fullSize = ref(false);
const mime = imageMime(path);
let disposed = false;

async function load(): Promise<void> {
    if (!mime || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        const bytes = await invoke<ArrayBuffer>('read_chat_image', {path});
        if (!disposed) source.value = URL.createObjectURL(new Blob([bytes], {type: mime}));
    } catch (reason) {
        if (!disposed) error.value = String(reason);
    } finally {
        busy.value = false;
    }
}
async function reveal(): Promise<void> {
    revealing.value = true;
    error.value = '';
    try {
        await invoke('reveal_chat_file', {path});
    } catch (reason) {
        if (!disposed) error.value = String(reason);
    } finally {
        revealing.value = false;
    }
}
function failedImage(): void {
    error.value = 'This file could not be displayed as an image.';
    URL.revokeObjectURL(source.value);
    source.value = '';
}
onMounted(() => {
    dialog.value?.showModal();
    void load();
});
onBeforeUnmount(() => {
    disposed = true;
    if (source.value) URL.revokeObjectURL(source.value);
    dialog.value?.close();
});
</script>

<template>
    <dialog ref="dialog" class="graphite-file-preview" aria-label="Local file preview" @close="emit('close')">
        <header>
            <strong>{{ path.split('/').pop() || 'Laboratory file' }}</strong>
            <button autofocus aria-label="Close preview" @click="emit('close')">Close</button>
        </header>
        <div class="graphite-file-actions">
            <button :disabled="revealing" @click="reveal">
                {{ revealing ? 'Opening folder…' : 'Show in folder' }}
            </button>
            <button v-if="source" :aria-pressed="fullSize" @click="fullSize = !fullSize">
                {{ fullSize ? 'Fit image' : 'Actual size' }}
            </button>
        </div>
        <p class="graphite-file-path">{{ path }}</p>
        <p v-if="busy" role="status">Loading image…</p>
        <p v-if="!mime">Use “Show in folder” to find this file in the laboratory.</p>
        <div v-if="error" role="alert">
            <p>{{ error }}</p>
            <button v-if="mime && !source" :disabled="busy" @click="load">Retry image</button>
        </div>
        <div v-if="source" class="graphite-image-stage" :class="{'graphite-image-actual': fullSize}">
            <img :src="source" :alt="path.split('/').pop()" @error="failedImage" />
        </div>
    </dialog>
</template>
