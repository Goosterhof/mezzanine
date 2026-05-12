<script setup lang="ts">
import {ref} from 'vue';

import type {DrydockPullRequest, ReviewVerdict} from './types';

import {useDrydock} from './useDrydock';

const {pr} = defineProps<{pr: DrydockPullRequest}>();

const drydock = useDrydock();
const body = ref('');
const error = ref<string | null>(null);

async function submit(verdict: ReviewVerdict): Promise<void> {
    error.value = null;
    if (verdict !== 'approve' && !body.value.trim()) {
        error.value = 'A body is required for Comment and Request Changes.';
        return;
    }
    try {
        await drydock.submitReview(pr, verdict, body.value);
        body.value = '';
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    }
}
</script>

<template>
    <section class="border-t border-mz-edge-soft bg-mz-canvas/40 px-5 py-3">
        <div class="mz-stamp-label mb-2">Review</div>
        <textarea
            v-model="body"
            class="mz-input w-full text-[12px] min-h-[4.5rem] resize-y"
            placeholder="Leave a note — required for Comment and Request Changes."
            :disabled="drydock.submitting.value"
            data-test="review-body"
        />
        <p v-if="error" class="text-mz-pulse-crashed font-mono text-[11px] mt-2" data-test="review-error">
            {{ error }}
        </p>
        <div class="flex items-center gap-2 mt-3">
            <button
                type="button"
                class="mz-button"
                :disabled="drydock.submitting.value"
                data-test="review-approve"
                @click="submit('approve')"
            >
                Approve
            </button>
            <button
                type="button"
                class="mz-button"
                :disabled="drydock.submitting.value"
                data-test="review-comment"
                @click="submit('comment')"
            >
                Comment
            </button>
            <button
                type="button"
                class="mz-button"
                :disabled="drydock.submitting.value"
                data-test="review-request-changes"
                @click="submit('request-changes')"
            >
                Request Changes
            </button>
            <span v-if="drydock.submitting.value" class="text-mz-text-faint font-mono text-[11px] ml-auto">
                Sending…
            </span>
        </div>
    </section>
</template>
