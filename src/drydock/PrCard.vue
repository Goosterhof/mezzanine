<script setup lang="ts">
import {computed} from 'vue';

import type {DrydockPullRequest} from './types';

import FileDiff from './FileDiff.vue';
import ReviewActions from './ReviewActions.vue';
import {useDrydock} from './useDrydock';

const {pr} = defineProps<{pr: DrydockPullRequest}>();

const drydock = useDrydock();

const key = computed(() => drydock.cacheKey(pr.repoFullName, pr.number));
const expanded = computed(() => drydock.isExpanded(key.value));
const entry = computed(() => drydock.fileCache[key.value] ?? null);
</script>

<template>
    <article class="border-b border-mz-edge bg-mz-rail" :data-pr="key">
        <button
            type="button"
            class="w-full text-left px-5 py-3 hover:bg-mz-edge-soft/40 transition-colors duration-100"
            :aria-expanded="expanded"
            data-test="pr-toggle"
            @click="drydock.toggleExpand(pr)"
        >
            <div class="flex items-center justify-between gap-3 mb-1">
                <div class="mz-stamp-label">{{ pr.repoLabel }}</div>
                <span class="font-mono text-[10px] text-mz-text-faint shrink-0">
                    #{{ pr.number }}
                    <span v-if="pr.isDraft" class="text-mz-signal ml-1">DRAFT</span>
                </span>
            </div>
            <h3 class="font-display text-mz-text text-[13px] tracking-wide leading-snug">
                {{ pr.title }}
            </h3>
            <div class="flex items-center gap-3 mt-1.5 font-mono text-[11px] text-mz-text-mute">
                <span>{{ pr.author }}</span>
                <span class="text-mz-text-faint">·</span>
                <code class="text-mz-brass">{{ pr.headRef }}</code>
                <span class="text-mz-text-faint">·</span>
                <span>{{ pr.changedFiles }} files</span>
                <span class="text-mz-pulse-awaiting">+{{ pr.additions }}</span>
                <span class="text-mz-pulse-crashed">−{{ pr.deletions }}</span>
            </div>
        </button>

        <section v-if="expanded" class="border-t border-mz-edge bg-mz-panel">
            <p v-if="entry?.loading" class="px-5 py-3 text-mz-text-faint font-mono text-[11px] italic">
                Reading the diff and lab memory…
            </p>
            <p
                v-else-if="entry?.error"
                class="px-5 py-3 text-mz-pulse-crashed font-mono text-[11px]"
                data-test="files-error"
            >
                {{ entry.error }}
            </p>
            <div v-else-if="entry && entry.files.length === 0" class="px-5 py-3">
                <p class="text-mz-text-faint font-mono text-[11px] italic">
                    This PR touches no files. Empty changeset.
                </p>
            </div>
            <template v-else-if="entry">
                <FileDiff
                    v-for="file in entry.files"
                    :key="file.path"
                    :file="file"
                    :enrichment="entry.enrichment[file.path]"
                />
                <ReviewActions :pr="pr" />
            </template>
        </section>
    </article>
</template>
