<script setup lang="ts">
import {MINIONS} from './minions';
import {useDispatch} from './useDispatch';

const dispatch = useDispatch();

function pickMinion(slug: string | null): void {
    dispatch.selectMinion(slug);
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
                    <p class="mt-1 text-xs text-mz-text-mute">
                        Targeting <span class="text-mz-text">The Lab</span> — pick a minion, or none for a plain
                        session.
                    </p>
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

            <div>
                <label class="mz-stamp-label block mb-1.5">Minion</label>
                <div class="grid gap-1.5" role="radiogroup" aria-label="Choose a minion">
                    <button
                        type="button"
                        role="radio"
                        :aria-checked="dispatch.minionSlug.value === null"
                        data-dispatch-minion="none"
                        class="flex items-center justify-between px-3 py-2 text-sm border transition-colors duration-100"
                        :class="
                            dispatch.minionSlug.value === null
                                ? 'border-mz-brass text-mz-text bg-mz-edge-soft/60'
                                : 'border-mz-edge text-mz-text-mute hover:border-mz-rule hover:text-mz-text'
                        "
                        @click="pickMinion(null)"
                    >
                        <span class="font-display tracking-wide">No minion</span>
                        <span class="font-mono text-xs op-60">plain session</span>
                    </button>
                    <button
                        v-for="minion in MINIONS"
                        :key="minion.slug"
                        type="button"
                        role="radio"
                        :aria-checked="dispatch.minionSlug.value === minion.slug"
                        :data-dispatch-minion="minion.slug"
                        class="flex items-center justify-between px-3 py-2 text-sm border transition-colors duration-100"
                        :class="
                            dispatch.minionSlug.value === minion.slug
                                ? 'border-mz-brass text-mz-text bg-mz-edge-soft/60'
                                : 'border-mz-edge text-mz-text-mute hover:border-mz-rule hover:text-mz-text'
                        "
                        @click="pickMinion(minion.slug)"
                    >
                        <span class="font-display tracking-wide">{{ minion.label }}</span>
                        <span class="font-mono text-xs op-60">@agent-{{ minion.slug }}</span>
                    </button>
                </div>
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
