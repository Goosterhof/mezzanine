<script setup lang="ts">
import {computed, ref, watch} from 'vue';

import {useCommandDraft} from '../command/useCommandDraft';
import {useShell} from '../shell/useShell';
import PrCard from './PrCard.vue';
import {isDependabot} from './types';
import {useDrydock} from './useDrydock';

const shell = useShell();
const drydock = useDrydock();
const filter = ref<'dependencies' | 'all'>('dependencies');
const query = ref('');
const actionError = ref<string | null>(null);
const groups = computed(() => {
    const rows = drydock.prs.value.filter(
        (pr) =>
            (filter.value === 'all' || isDependabot(pr)) &&
            `${pr.repoLabel} ${pr.title}`.toLowerCase().includes(query.value.toLowerCase()),
    );
    return [...new Set(rows.map((pr) => pr.repoFullName))].map((repo) => ({
        repo,
        prs: rows.filter((pr) => pr.repoFullName === repo),
    }));
});
function prepare(repo: string): void {
    actionError.value = null;
    try {
        useCommandDraft().prepare(
            'mad-scientist',
            `Prepare the Dependabot updates for ${repo}. Read Pattern 031 and .claude/workflows/drain.js, inspect exact PR-diff versions, consolidate overlapping changes, run the local gates and hold breaking updates. Present a tested result for my merge decision. Do not push, merge, deploy or close PRs from this preparation request.`,
        );
    } catch (e) {
        actionError.value = String(e);
    }
}

const open = computed(() => shell.page.value === 'drydock');

const lastRefreshedLabel = computed(() => {
    const value = drydock.lastRefreshedAt.value;
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleTimeString();
});

watch(
    open,
    (isOpen) => {
        if (isOpen) {
            void drydock.refresh();
        }
    },
    {immediate: true},
);
</script>

<template>
    <section v-show="open" data-page="drydock" class="h-full min-h-0 bg-mz-panel flex flex-col">
        <header class="flex items-center justify-between px-5 py-3 border-b border-mz-edge flex-shrink-0">
            <div>
                <div class="mz-stamp-label">Laboratory</div>
                <h2 class="font-display text-mz-text text-base tracking-wide mt-0.5">Drydock</h2>
            </div>
            <div class="flex items-center gap-2">
                <span
                    v-if="lastRefreshedLabel"
                    class="text-mz-text-faint font-mono text-[11px]"
                    :title="`Last refreshed at ${drydock.lastRefreshedAt.value}`"
                >
                    {{ lastRefreshedLabel }}
                </span>
                <button
                    type="button"
                    class="mz-button"
                    data-test="drydock-refresh"
                    :disabled="drydock.loading.value"
                    @click="drydock.refresh()"
                >
                    {{ drydock.loading.value ? 'Reading…' : 'Refresh' }}
                </button>
            </div>
        </header>

        <p
            v-if="drydock.lastError.value"
            class="px-5 py-2 bg-mz-pulse-crashed/10 border-b border-mz-pulse-crashed/40 text-mz-pulse-crashed font-mono text-[11px]"
            data-test="drydock-error"
        >
            {{ drydock.lastError.value }}
        </p>

        <div class="px-5 py-3 flex gap-2 border-b border-mz-edge">
            <button class="mz-button" :aria-pressed="filter === 'dependencies'" @click="filter = 'dependencies'">
                Dependabot
            </button>
            <button class="mz-button" :aria-pressed="filter === 'all'" data-all-prs @click="filter = 'all'">
                All PRs
            </button>
            <input
                v-model="query"
                class="mz-input flex-1 min-w-0"
                placeholder="Find a repository or update…"
                aria-label="Search pull requests"
            />
        </div>
        <p v-if="drydock.mergeOutcome.value" role="status" class="px-5 py-3 text-mz-brass">
            {{ drydock.mergeOutcome.value }}
        </p>
        <p v-if="actionError" role="alert" class="px-5 py-2 text-mz-pulse-crashed">{{ actionError }}</p>
        <div v-if="drydock.warnings.value.length" class="px-5 py-3 text-mz-signal text-xs" role="alert">
            <strong>Partial view — some repositories could not be fully read.</strong>
            <p v-for="warning in drydock.warnings.value" :key="warning">{{ warning }}</p>
        </div>
        <div class="flex-1 overflow-y-auto relative">
            <div
                v-if="drydock.auth.value && !drydock.auth.value.authenticated"
                class="px-5 py-6 text-center"
                data-test="drydock-unauth"
            >
                <p class="text-mz-text-faint font-mono text-[12px] italic">
                    gh CLI not authenticated. Run
                    <code class="text-mz-brass">gh auth login</code>
                    in a terminal.
                </p>
            </div>
            <div
                v-else-if="!drydock.loading.value && drydock.prs.value.length === 0"
                class="px-5 py-6 text-center"
                data-test="drydock-empty"
            >
                <p class="text-mz-text-faint font-mono text-[12px] italic">
                    {{
                        drydock.warnings.value.length
                            ? 'No PRs returned from the available repositories.'
                            : 'No open PRs across the laboratory. Clean slate.'
                    }}
                </p>
            </div>
            <p
                v-if="!drydock.loading.value && drydock.prs.value.length && !groups.length"
                class="p-5 text-sm text-mz-text-mute"
            >
                No matching PRs. Try All PRs or another search.
            </p>
            <section v-for="group in groups" :key="group.repo" class="mb-5">
                <header class="px-5 py-3 flex items-center justify-between bg-mz-canvas">
                    <div>
                        <h3 class="mz-stamp-label">{{ group.prs[0]?.repoLabel }}</h3>
                        <p class="text-xs text-mz-text-mute mt-1">
                            {{ group.prs.length }} open {{ group.prs.length === 1 ? 'PR' : 'PRs' }}
                        </p>
                    </div>
                    <button v-if="group.prs.some(isDependabot)" class="mz-button" @click="prepare(group.repo)">
                        Prepare updates
                    </button>
                </header>
                <PrCard v-for="pr in group.prs" :key="`${pr.repoFullName}#${pr.number}`" :pr="pr" />
            </section>
        </div>
    </section>
</template>
