import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {
    ActiveExperimentLog,
    ChaosDetonation,
    DrydockPrFile,
    DrydockPullRequest,
    GhAuthStatus,
    MinionTouch,
} from '../../src/drydock/types';

import {useDrydock} from '../../src/drydock/useDrydock';

const mockedInvoke = vi.mocked(invoke);

const AUTH_OK: GhAuthStatus = {authenticated: true, message: 'gh authenticated'};
const AUTH_BAD: GhAuthStatus = {authenticated: false, message: 'not authenticated'};

const PR_CRUCIBLE: DrydockPullRequest = {
    repoFullName: 'Goosterhof/zmuuzn-strava',
    repoLabel: 'The Crucible',
    repoLocalPath: 'experiments/zmuuzn-strava',
    experimentScope: 'crucible',
    number: 42,
    title: 'Forge calendar pass',
    author: 'gerard',
    headRef: 'feat/forge-calendar',
    isDraft: false,
    additions: 120,
    deletions: 18,
    changedFiles: 3,
    url: 'https://github.com/Goosterhof/zmuuzn-strava/pull/42',
};

const FILES: DrydockPrFile[] = [
    {path: 'frontend/src/forge/ForgeCalendar.vue', additions: 60, deletions: 10},
    {path: 'backend/app/Actions/ListForgeMonthAction.php', additions: 60, deletions: 8},
];

const TOUCH: MinionTouch = {
    minion: 'The Task Master',
    commitHash: 'abc1234567',
    author: 'gerard',
    date: '2026-04-12',
    subject: 'feat(crucible): pane [DELIVERED]',
};

const CHAOS: ChaosDetonation[] = [
    {
        reportNumber: '00045',
        reportFilename: '00045-chaos.md',
        title: 'Chaos Report #00045',
        madnessScore: 8,
        madnessLabel: 'Burning',
    },
];

const ACTIVE_LOG: ActiveExperimentLog = {
    number: '00047',
    filename: '00047-the-crucible-calendar.md',
    title: 'The Crucible Calendar',
    status: 'IN PROGRESS',
    scope: 'crucible',
};

function stubInvoke(
    overrides: Partial<{
        ghAuth: GhAuthStatus;
        prs: DrydockPullRequest[];
        files: DrydockPrFile[];
        touch: MinionTouch | null;
        chaos: ChaosDetonation[];
        activeLog: ActiveExperimentLog | null;
    }> = {},
): void {
    mockedInvoke.mockImplementation((cmd: string) => {
        switch (cmd) {
            case 'gh_auth_status':
                return Promise.resolve(overrides.ghAuth ?? AUTH_OK);
            case 'list_open_prs':
                return Promise.resolve(overrides.prs ?? [PR_CRUCIBLE]);
            case 'pull_request_files':
                return Promise.resolve(overrides.files ?? FILES);
            case 'find_minion_touch':
                return Promise.resolve(overrides.touch === undefined ? TOUCH : overrides.touch);
            case 'find_chaos_detonations':
                return Promise.resolve(overrides.chaos ?? CHAOS);
            case 'find_active_experiment_log':
                return Promise.resolve(overrides.activeLog === undefined ? ACTIVE_LOG : overrides.activeLog);
            case 'approve_pr':
            case 'comment_pr':
            case 'request_changes_pr':
                return Promise.resolve(undefined);
            default:
                return Promise.resolve(undefined);
        }
    });
}

describe('useDrydock', () => {
    beforeEach(() => {
        useDrydock().reset();
        mockedInvoke.mockReset();
        stubInvoke();
    });

    it('refresh populates auth status, PR list, and last-refreshed timestamp', async () => {
        const drydock = useDrydock();
        expect(drydock.prs.value).toStrictEqual([]);
        expect(drydock.lastRefreshedAt.value).toBeNull();

        await drydock.refresh();

        expect(drydock.auth.value?.authenticated).toBe(true);
        expect(drydock.prs.value).toHaveLength(1);
        expect(drydock.prs.value[0]!.title).toBe('Forge calendar pass');
        expect(drydock.lastRefreshedAt.value).not.toBeNull();
    });

    it('refresh skips list_open_prs when gh is not authenticated', async () => {
        stubInvoke({ghAuth: AUTH_BAD});
        const drydock = useDrydock();

        await drydock.refresh();

        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).toContain('gh_auth_status');
        expect(cmds).not.toContain('list_open_prs');
        expect(drydock.auth.value?.authenticated).toBe(false);
        expect(drydock.prs.value).toStrictEqual([]);
    });

    it('refresh sticky-fails: lastError set, previous PRs survive a single bad refresh', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        expect(drydock.prs.value).toHaveLength(1);

        mockedInvoke.mockReset();
        mockedInvoke.mockRejectedValueOnce(new Error('gh broke'));
        await drydock.refresh();
        expect(drydock.lastError.value).toBe('gh broke');
        expect(drydock.prs.value).toHaveLength(1);
    });

    it('toggleExpand loads files + per-file enrichment in parallel', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        const pr = drydock.prs.value[0]!;

        await drydock.toggleExpand(pr);

        expect(drydock.expanded.value).toBe(drydock.cacheKey(pr.repoFullName, pr.number));
        const entry = drydock.fileCache[drydock.cacheKey(pr.repoFullName, pr.number)]!;
        const firstPath = FILES[0]!.path;
        expect(entry.files).toHaveLength(2);
        expect(entry.enrichment[firstPath]!.minionTouch?.minion).toBe('The Task Master');
        expect(entry.enrichment[firstPath]!.chaosDetonations).toHaveLength(1);
        expect(entry.enrichment[firstPath]!.activeLog?.number).toBe('00047');
    });

    it('toggleExpand collapses the card a second time and does not refetch', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        const pr = drydock.prs.value[0]!;

        await drydock.toggleExpand(pr);
        mockedInvoke.mockClear();

        await drydock.toggleExpand(pr);
        expect(drydock.expanded.value).toBeNull();
        expect(mockedInvoke).not.toHaveBeenCalled();
    });

    it('toggleExpand uses cache on re-expand', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        const pr = drydock.prs.value[0]!;

        await drydock.toggleExpand(pr);
        await drydock.toggleExpand(pr); // collapse
        mockedInvoke.mockClear();

        await drydock.toggleExpand(pr); // re-expand
        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).not.toContain('pull_request_files');
        expect(cmds).not.toContain('find_minion_touch');
    });

    it('toggleExpand skips active-log fetch when experiment scope is null', async () => {
        const orphanPr: DrydockPullRequest = {...PR_CRUCIBLE, experimentScope: null};
        stubInvoke({prs: [orphanPr]});
        const drydock = useDrydock();
        await drydock.refresh();

        await drydock.toggleExpand(orphanPr);
        const cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds).not.toContain('find_active_experiment_log');
        const entry = drydock.fileCache[drydock.cacheKey(orphanPr.repoFullName, orphanPr.number)]!;
        expect(entry.enrichment[FILES[0]!.path]!.activeLog).toBeNull();
    });

    it('submitReview routes verdict to the right Tauri command and refreshes after', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        const pr = drydock.prs.value[0]!;

        mockedInvoke.mockClear();
        stubInvoke();
        await drydock.submitReview(pr, 'approve', 'LGTM');
        let cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds[0]).toBe('approve_pr');

        mockedInvoke.mockClear();
        stubInvoke();
        await drydock.submitReview(pr, 'request-changes', 'tighten up');
        cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds[0]).toBe('request_changes_pr');

        mockedInvoke.mockClear();
        stubInvoke();
        await drydock.submitReview(pr, 'comment', 'note');
        cmds = mockedInvoke.mock.calls.map(([cmd]) => cmd);
        expect(cmds[0]).toBe('comment_pr');
        // Each submit triggers a refresh.
        expect(cmds).toContain('list_open_prs');
    });

    it('submitReview clears submitting flag even when invoke throws', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        const pr = drydock.prs.value[0]!;

        mockedInvoke.mockReset();
        mockedInvoke.mockRejectedValueOnce(new Error('gh boom'));
        await expect(drydock.submitReview(pr, 'approve', '')).rejects.toThrow('gh boom');
        expect(drydock.submitting.value).toBe(false);
    });

    it('reset clears auth, PRs, expanded, cache, and timestamps', async () => {
        const drydock = useDrydock();
        await drydock.refresh();
        await drydock.toggleExpand(drydock.prs.value[0]!);

        drydock.reset();

        expect(drydock.auth.value).toBeNull();
        expect(drydock.prs.value).toStrictEqual([]);
        expect(drydock.expanded.value).toBeNull();
        expect(Object.keys(drydock.fileCache)).toHaveLength(0);
        expect(drydock.lastRefreshedAt.value).toBeNull();
    });
});
