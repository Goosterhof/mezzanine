import {relaunch} from '@tauri-apps/plugin-process';
import {check, type DownloadEvent, type Update} from '@tauri-apps/plugin-updater';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useAscent} from '../../src/ascent/useAscent';

vi.mock('@tauri-apps/plugin-updater', () => ({check: vi.fn<() => Promise<unknown>>()}));
vi.mock('@tauri-apps/plugin-process', () => ({relaunch: vi.fn<() => Promise<void>>(() => Promise.resolve())}));

const mockedCheck = vi.mocked(check);
const mockedRelaunch = vi.mocked(relaunch);

/**
 * Build a fake `Update` resource. `events` are replayed into the
 * downloadAndInstall callback in order; `fail` makes the install reject (the
 * security-rejection / generic-error paths).
 */
function fakeUpdate(opts: {version?: string; events?: DownloadEvent[]; fail?: Error} = {}): Update {
    return {
        version: opts.version ?? '0.2.0',
        currentVersion: '0.1.0',
        date: '2026-06-02',
        body: 'Release notes for the newer balcony.',
        downloadAndInstall: vi.fn<(onEvent?: (event: DownloadEvent) => void) => Promise<void>>(
            (onEvent?: (event: DownloadEvent) => void): Promise<void> => {
                if (onEvent) {
                    for (const event of opts.events ?? []) {
                        onEvent(event);
                    }
                }
                return opts.fail ? Promise.reject(opts.fail) : Promise.resolve();
            },
        ),
    } as unknown as Update;
}

describe('useAscent', () => {
    beforeEach(() => {
        useAscent()._resetForTests();
        mockedCheck.mockReset();
        mockedRelaunch.mockReset();
        mockedRelaunch.mockResolvedValue(undefined);
    });

    describe('check', () => {
        it('boot check with nothing waiting resolves idle and stays silent', async () => {
            mockedCheck.mockResolvedValue(null);
            const ascent = useAscent();

            await ascent.check();

            expect(ascent.status.value).toBe('idle');
            expect(ascent.visible.value).toBe(false);
            expect(ascent.showsCurrent.value).toBe(false);
            expect(ascent.availableVersion.value).toBeNull();
        });

        it('manual check with nothing waiting surfaces the "Balcony current" confirmation', async () => {
            mockedCheck.mockResolvedValue(null);
            const ascent = useAscent();

            await ascent.check({surface: true});

            expect(ascent.status.value).toBe('idle');
            expect(ascent.showsCurrent.value).toBe(true);
            expect(ascent.visible.value).toBe(true);
        });

        it('a newer balcony moves to available with its version + meta', async () => {
            mockedCheck.mockResolvedValue(fakeUpdate({version: '0.3.0'}));
            const ascent = useAscent();

            await ascent.check();

            expect(ascent.status.value).toBe('available');
            expect(ascent.availableVersion.value).toBe('0.3.0');
            expect(ascent.meta.value).toStrictEqual({
                version: '0.3.0',
                currentVersion: '0.1.0',
                date: '2026-06-02',
                body: 'Release notes for the newer balcony.',
            });
            expect(ascent.visible.value).toBe(true);
        });

        it('a failed check lands on error with the message, balcony unchanged', async () => {
            mockedCheck.mockRejectedValue(new Error('Could not reach the release endpoint'));
            const ascent = useAscent();

            await ascent.check();

            expect(ascent.status.value).toBe('error');
            expect(ascent.lastError.value).toBe('Could not reach the release endpoint');
            expect(ascent.visible.value).toBe(true);
        });

        it('coerces a non-Error rejection to a string message', async () => {
            mockedCheck.mockRejectedValue('endpoint string failure');
            const ascent = useAscent();

            await ascent.check();

            expect(ascent.status.value).toBe('error');
            expect(ascent.lastError.value).toBe('endpoint string failure');
        });

        it('refuses to stack a check onto an in-flight descent', async () => {
            // Hold a descent open so status stays "downloading".
            let release!: () => void;
            const pending = new Promise<void>((resolve) => {
                release = resolve;
            });
            const update = {
                version: '0.2.0',
                currentVersion: '0.1.0',
                downloadAndInstall: vi.fn<() => Promise<void>>(() => pending),
            } as unknown as Update;
            mockedCheck.mockResolvedValue(update);
            const ascent = useAscent();
            await ascent.check();
            mockedCheck.mockClear();

            void ascent.descend();
            await ascent.check(); // should early-return — a descent is in flight

            expect(ascent.status.value).toBe('downloading');
            expect(mockedCheck).not.toHaveBeenCalled();
            release();
        });
    });

    describe('descend', () => {
        it('is a no-op unless an update is on offer', async () => {
            const ascent = useAscent();

            await ascent.descend();

            expect(ascent.status.value).toBe('idle');
            expect(mockedRelaunch).not.toHaveBeenCalled();
        });

        it('streams progress, finishes, and relaunches into the new balcony', async () => {
            mockedCheck.mockResolvedValue(
                fakeUpdate({
                    events: [
                        {event: 'Started', data: {contentLength: 200}},
                        {event: 'Progress', data: {chunkLength: 50}},
                        {event: 'Finished'},
                    ],
                }),
            );
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.downloadPct.value).toBe(100);
            expect(ascent.isSteppingDown.value).toBe(true);
            expect(mockedRelaunch).toHaveBeenCalledOnce();
        });

        it('computes percentage from chunk length against content length', async () => {
            mockedCheck.mockResolvedValue(
                fakeUpdate({
                    events: [
                        {event: 'Started', data: {contentLength: 200}},
                        {event: 'Progress', data: {chunkLength: 50}},
                    ],
                }),
            );
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.downloadPct.value).toBe(25);
            expect(ascent.isSteppingDown.value).toBe(false);
        });

        it('caps mid-flight progress at 99 until the finished event', async () => {
            mockedCheck.mockResolvedValue(
                fakeUpdate({
                    events: [
                        {event: 'Started', data: {contentLength: 100}},
                        {event: 'Progress', data: {chunkLength: 100}},
                    ],
                }),
            );
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.downloadPct.value).toBe(99);
        });

        it('leaves progress at 0 when the manifest carries no content length', async () => {
            mockedCheck.mockResolvedValue(
                fakeUpdate({
                    events: [
                        {event: 'Started', data: {}},
                        {event: 'Progress', data: {chunkLength: 80}},
                    ],
                }),
            );
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.downloadPct.value).toBe(0);
        });

        it('routes a signature failure to rejected and never relaunches', async () => {
            mockedCheck.mockResolvedValue(fakeUpdate({fail: new Error('Signature verification failed')}));
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.status.value).toBe('rejected');
            expect(ascent.lastError.value).toBe('Signature verification failed');
            expect(mockedRelaunch).not.toHaveBeenCalled();
        });

        it('routes a non-security failure to error', async () => {
            mockedCheck.mockResolvedValue(fakeUpdate({fail: new Error('Disk full while writing bundle')}));
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.status.value).toBe('error');
            expect(mockedRelaunch).not.toHaveBeenCalled();
        });

        it('coerces a non-Error descent failure to a string and treats it as error', async () => {
            mockedCheck.mockResolvedValue(fakeUpdate({fail: 'plain string failure' as unknown as Error}));
            const ascent = useAscent();
            await ascent.check();

            await ascent.descend();

            expect(ascent.status.value).toBe('error');
            expect(ascent.lastError.value).toBe('plain string failure');
        });
    });

    describe('dismiss', () => {
        it('stands the investor pat: clears the offer and hides the prompt', async () => {
            mockedCheck.mockResolvedValue(fakeUpdate());
            const ascent = useAscent();
            await ascent.check();
            expect(ascent.status.value).toBe('available');

            ascent.dismiss();

            expect(ascent.status.value).toBe('idle');
            expect(ascent.meta.value).toBeNull();
            expect(ascent.availableVersion.value).toBeNull();
            expect(ascent.visible.value).toBe(false);
        });
    });
});
