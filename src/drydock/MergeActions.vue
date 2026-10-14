<script setup lang="ts">
import {invoke} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';
import {onBeforeUnmount, ref, watch} from 'vue';

import type {DrydockPullRequest, MergeCandidate} from './types';

import {useCommandDraft} from '../command/useCommandDraft';
import {useDrydock} from './useDrydock';

const {pr} = defineProps<{pr: DrydockPullRequest}>();
const candidate = ref<MergeCandidate | null>(null);
const loading = ref(false);
const merging = ref(false);
const error = ref<string | null>(null);
let generation = 0;
async function refresh(): Promise<void> {
    const current = ++generation;
    loading.value = true;
    candidate.value = null;
    error.value = null;
    try {
        const result = await invoke<MergeCandidate>('read_merge_candidate', {
            repoFullName: pr.repoFullName,
            number: pr.number,
        });
        if (current === generation) {
            if (pr.headOid && pr.headOid !== result.headOid) {
                result.ready = false;
                result.reason = 'This PR changed since the dock was read. Refresh the dock before merging.';
            }
            candidate.value = result;
        }
    } catch (e) {
        if (current === generation) error.value = String(e);
    } finally {
        if (current === generation) loading.value = false;
    }
}
watch(
    () => [pr.repoFullName, pr.number, pr.headOid],
    () => {
        void refresh();
    },
    {immediate: true},
);
onBeforeUnmount(() => {
    generation++;
});
async function merge(): Promise<void> {
    if (!candidate.value?.ready || merging.value) return;
    merging.value = true;
    error.value = null;
    try {
        const outcome = await invoke<string>('merge_dependabot_pr', {
            repoFullName: pr.repoFullName,
            number: pr.number,
            expectedHead: candidate.value.headOid,
        });
        useDrydock().mergeOutcome.value = `${pr.repoLabel} #${pr.number}: ${outcome}`;
        candidate.value = null;
        await useDrydock().refresh();
    } catch (e) {
        error.value = String(e);
        candidate.value = null;
    } finally {
        merging.value = false;
    }
}
function prepare(): void {
    error.value = null;
    try {
        useCommandDraft().prepare(
            'mad-scientist',
            `Prepare and locally verify the dependency updates for ${pr.repoFullName}, starting with ${pr.url}. Read Pattern 031 and .claude/workflows/drain.js; inspect exact PR diffs, consolidate overlapping updates and hold breaking changes. Present the tested result and merge recommendation. This request does not authorize pushing, merging, deploying or closing PRs.`,
        );
    } catch (e) {
        error.value = String(e);
    }
}
async function visit(url: string): Promise<void> {
    if (!url.startsWith('https://')) return;
    try {
        await openUrl(url);
    } catch (e) {
        error.value = String(e);
    }
}
</script>
<template>
    <section class="p-5 border-t border-mz-edge bg-mz-canvas/40">
        <div class="flex items-center justify-between">
            <h4 class="mz-stamp-label">Dependency update</h4>
            <button class="mz-button" :disabled="loading || merging" @click="refresh">Refresh evidence</button>
        </div>
        <p v-if="loading" class="text-sm text-mz-text-mute mt-3">
            Reading the current revision, checks and merge rules…
        </p>
        <template v-if="candidate">
            <p class="mt-3 text-sm" :class="candidate.ready ? 'text-mz-pulse-awaiting' : 'text-mz-signal'">
                {{ candidate.reason }}
            </p>
            <p class="text-xs font-mono text-mz-text-mute mt-2">
                {{ candidate.headOid.slice(0, 12) }} ·
                {{ candidate.method === 'merge' ? 'merge commit' : candidate.method }}
            </p>
            <ul class="my-3 space-y-1">
                <li
                    v-for="check in candidate.checks"
                    :key="`${check.name}-${check.url}`"
                    class="text-xs flex justify-between gap-3"
                >
                    <button class="text-left underline" :disabled="!check.url" @click="visit(check.url)">
                        {{ check.name }}</button
                    ><span class="font-mono">{{ check.state }}</span>
                </li>
            </ul>
            <details v-if="candidate.body" class="text-sm my-3">
                <summary class="cursor-pointer text-mz-text-mute">Dependency changes and release notes</summary>
                <p class="whitespace-pre-wrap break-words mt-3 max-h-72 overflow-y-auto">{{ candidate.body }}</p>
            </details>
        </template>
        <p v-if="error" role="alert" class="text-sm text-mz-pulse-crashed my-3">{{ error }}</p>
        <div class="flex flex-wrap gap-2 mt-4">
            <button
                v-if="candidate?.ready"
                class="mz-button border-mz-brass text-mz-brass"
                :disabled="merging"
                data-merge-dependency
                @click="merge"
            >
                {{ merging ? 'Merging…' : `Merge #${pr.number}` }}
            </button>
            <button class="mz-button" :disabled="merging" @click="prepare">Prepare updates</button>
            <button class="mz-button" @click="visit(`${pr.url}/files`)">Inspect diff on GitHub</button>
        </div>
        <p class="text-xs text-mz-text-mute mt-3">
            Merge rechecks this exact revision. Held updates and unavailable CI can be prepared with a colleague.
        </p>
    </section>
</template>
