<script setup lang="ts">
import {ref, watch} from 'vue';

import type {Target} from '../roster/types';

import TargetPicker from './TargetPicker.vue';
import {useDispatch} from './useDispatch';

const dispatch = useDispatch();
const briefRef = ref<HTMLTextAreaElement | null>(null);

watch(
    () => dispatch.open.value,
    (open) => {
        if (open) {
            void Promise.resolve().then(() => briefRef.value?.focus());
        }
    },
);

function pickTarget(target: Target): void {
    dispatch.setTarget(target);
}

function onBriefInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    dispatch.setBrief(el.value);
}

function onSubmit(): void {
    void dispatch.submit();
}

function onCancel(): void {
    dispatch.hide();
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        dispatch.hide();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (dispatch.canSubmit.value) {
            onSubmit();
        }
    }
}
</script>

<template>
    <div
        v-if="dispatch.open.value"
        data-dispatch-sheet
        class="absolute inset-x-0 top-0 z-30 bg-mz-panel/95 backdrop-blur border-b border-mz-edge shadow-balcony"
        role="dialog"
        aria-label="Dispatch a scientist"
        @keydown="onKeydown"
    >
        <div class="max-w-4xl mx-auto px-8 py-6 grid gap-5">
            <header class="flex items-center justify-between">
                <div>
                    <div class="mz-stamp-label">Dispatch</div>
                    <h2 class="font-display text-mz-text text-lg tracking-wide">Send a scientist to the lab floor</h2>
                </div>
                <button
                    type="button"
                    class="mz-button-icon"
                    aria-label="Close dispatch"
                    data-dispatch-close
                    @click="onCancel"
                >
                    ✕
                </button>
            </header>

            <TargetPicker :selected="dispatch.target.value" @select="pickTarget" />

            <div>
                <label class="mz-stamp-label block mb-1.5" for="dispatch-brief">Brief</label>
                <textarea
                    id="dispatch-brief"
                    ref="briefRef"
                    :value="dispatch.brief.value"
                    rows="5"
                    class="w-full mz-input resize-none"
                    placeholder="What is the mission? Free-form — the scientist receives this as the opening prompt."
                    data-dispatch-brief
                    @input="onBriefInput"
                ></textarea>
                <p v-if="dispatch.lastError.value" data-dispatch-error class="mt-2 text-xs text-mz-pulse-crashed">
                    {{ dispatch.lastError.value }}
                </p>
            </div>

            <footer class="flex items-center justify-end gap-2">
                <button type="button" class="mz-button" data-dispatch-cancel @click="onCancel">Cancel</button>
                <button
                    type="button"
                    class="mz-button border-mz-brass text-mz-text"
                    data-dispatch-submit
                    :disabled="!dispatch.canSubmit.value"
                    @click="onSubmit"
                >
                    {{ dispatch.submitting.value ? 'Dispatching…' : 'Dispatch' }}
                </button>
            </footer>
        </div>
    </div>
</template>
