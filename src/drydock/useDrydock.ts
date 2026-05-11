// useDrydock — singleton state + IPC for the Drydock panel.
//
// Three concerns live here:
//
//   1. PR enumeration — `gh pr list` per repo, surfaced as a flat list
//      with repo metadata stamped on each row. Refreshes on panel open
//      and on manual refresh; failure is sticky-non-blocking (the panel
//      shows the error stamp but keeps the previous list visible).
//
//   2. PR file expansion — when the investor unfolds a PR card, fetch
//      its changed-files list + the three enrichment fields per file in
//      parallel. Cache by `${repoFullName}#${number}` so re-folding and
//      re-opening doesn't re-hit `gh`.
//
//   3. Review submission — Approve / Comment / Request Changes verbs.
//      The body comes from a small inline editor; on success, the PR
//      list refreshes so the reviewed PR drops if it was the last one
//      requiring review.

import {invoke} from '@tauri-apps/api/core';
import {computed, reactive, ref} from 'vue';

import type {
    ActiveExperimentLog,
    ChaosDetonation,
    DrydockPrFile,
    DrydockPullRequest,
    FileEnrichment,
    GhAuthStatus,
    MinionTouch,
    ReviewVerdict,
} from './types';

import {EMPTY_FILE_ENRICHMENT} from './types';

interface PrFilesEntry {
    files: DrydockPrFile[];
    enrichment: Record<string, FileEnrichment>;
    loading: boolean;
    error: string | null;
}

const auth = ref<GhAuthStatus | null>(null);
const prs = ref<DrydockPullRequest[]>([]);
const loading = ref(false);
const lastError = ref<string | null>(null);
const lastRefreshedAt = ref<string | null>(null);
const expanded = ref<string | null>(null);
const fileCache = reactive<Record<string, PrFilesEntry>>({});
const submitting = ref(false);

function cacheKey(repoFullName: string, number: number): string {
    return `${repoFullName}#${number}`;
}

function ensureFilesEntry(key: string): PrFilesEntry {
    fileCache[key] ??= {files: [], enrichment: {}, loading: false, error: null};
    return fileCache[key];
}

function verdictCommand(verdict: ReviewVerdict): string {
    if (verdict === 'approve') return 'approve_pr';
    if (verdict === 'request-changes') return 'request_changes_pr';
    return 'comment_pr';
}

async function refreshState(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
        const status = await invoke<GhAuthStatus>('gh_auth_status');
        auth.value = status;
        if (status.authenticated) {
            prs.value = await invoke<DrydockPullRequest[]>('list_open_prs');
        } else {
            prs.value = [];
        }
        lastRefreshedAt.value = new Date().toISOString();
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error);
    } finally {
        loading.value = false;
    }
}

async function loadFilesForPr(pr: DrydockPullRequest, entry: PrFilesEntry): Promise<void> {
    entry.loading = true;
    entry.error = null;
    try {
        const files = await invoke<DrydockPrFile[]>('pull_request_files', {
            repoFullName: pr.repoFullName,
            number: pr.number,
        });
        entry.files = files;
        await Promise.all(files.map((file) => loadEnrichment(pr, file, entry)));
    } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
    } finally {
        entry.loading = false;
    }
}

async function loadEnrichment(pr: DrydockPullRequest, file: DrydockPrFile, entry: PrFilesEntry): Promise<void> {
    entry.enrichment[file.path] = {...EMPTY_FILE_ENRICHMENT, loading: true};
    try {
        const [minionTouch, chaosDetonations, activeLog] = await Promise.all([
            invoke<MinionTouch | null>('find_minion_touch', {repoLocalPath: pr.repoLocalPath, filePath: file.path}),
            invoke<ChaosDetonation[]>('find_chaos_detonations', {filePath: file.path}),
            pr.experimentScope
                ? invoke<ActiveExperimentLog | null>('find_active_experiment_log', {scope: pr.experimentScope})
                : Promise.resolve(null),
        ]);
        entry.enrichment[file.path] = {minionTouch, chaosDetonations, activeLog, loading: false, error: null};
    } catch (error) {
        entry.enrichment[file.path] = {
            ...EMPTY_FILE_ENRICHMENT,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function useDrydock() {
    return {
        auth,
        prs,
        loading,
        lastError,
        lastRefreshedAt,
        expanded,
        fileCache,
        submitting,

        isExpanded(key: string): boolean {
            return expanded.value === key;
        },

        cacheKey,

        filesFor: computed(() => (key: string) => fileCache[key] ?? null),

        refresh: refreshState,

        async toggleExpand(pr: DrydockPullRequest): Promise<void> {
            const key = cacheKey(pr.repoFullName, pr.number);
            if (expanded.value === key) {
                expanded.value = null;
                return;
            }
            expanded.value = key;
            const entry = ensureFilesEntry(key);
            if (entry.files.length > 0 || entry.loading) {
                return;
            }
            await loadFilesForPr(pr, entry);
        },

        async submitReview(pr: DrydockPullRequest, verdict: ReviewVerdict, body: string): Promise<void> {
            submitting.value = true;
            try {
                await invoke(verdictCommand(verdict), {repoFullName: pr.repoFullName, number: pr.number, body});
                await refreshState();
            } finally {
                submitting.value = false;
            }
        },

        reset(): void {
            auth.value = null;
            prs.value = [];
            loading.value = false;
            lastError.value = null;
            lastRefreshedAt.value = null;
            expanded.value = null;
            for (const key of Object.keys(fileCache)) {
                delete fileCache[key];
            }
            submitting.value = false;
        },
    };
}
