import {invoke} from '@tauri-apps/api/core';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useServiceMonitor} from '../../src/holotable/useServiceMonitor';
const ping = {
    slug: 'parlour',
    label: 'The Parlour',
    url: 'https://parlour.zmuuzn.nl/up',
    healthy: true,
    statusCode: 200,
    responseTimeMs: 20,
    error: '',
};
const mockedInvoke = vi.mocked(invoke);
describe('app-owned service watch', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useServiceMonitor().reset();
        mockedInvoke.mockReset();
    });
    afterEach(() => {
        useServiceMonitor().reset();
        vi.useRealTimers();
    });
    it('shows the first failure, announces only sustained failure and recovery', async () => {
        const monitor = useServiceMonitor();
        mockedInvoke.mockResolvedValue({experiments: [{...ping, healthy: false, statusCode: 503, error: 'HTTP 503'}]});
        await monitor.refresh();
        expect(monitor.attention.value).toBe(1);
        expect(monitor.notice.value).toBeNull();
        await monitor.refresh();
        expect(monitor.notice.value).toContain('needs attention');
        monitor.notice.value = null;
        await monitor.refresh();
        expect(monitor.notice.value).toBeNull();
        mockedInvoke.mockResolvedValue({experiments: [ping]});
        await monitor.refresh();
        expect(monitor.notice.value).toContain('recovered');
        expect(monitor.attention.value).toBe(0);
    });
    it('polls while other pages are open and makes aged evidence unknown', async () => {
        mockedInvoke.mockResolvedValue({experiments: [ping]});
        const monitor = useServiceMonitor();
        monitor.start();
        await vi.advanceTimersByTimeAsync(60000);
        expect(mockedInvoke).toHaveBeenCalledTimes(2);
        mockedInvoke.mockRejectedValue(new Error('bridge offline'));
        await vi.advanceTimersByTimeAsync(160000);
        expect(monitor.stale.value).toBe(true);
        expect(monitor.health(monitor.services.value[0]!)).toBe('unknown');
        expect(monitor.error.value).toContain('bridge offline');
    });
    it('does not overlap polls or accept a late result after stop', async () => {
        let finish!: (value: unknown) => void;
        mockedInvoke.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const monitor = useServiceMonitor();
        monitor.start();
        await vi.advanceTimersByTimeAsync(120000);
        expect(mockedInvoke).toHaveBeenCalledTimes(1);
        monitor.stop();
        finish({experiments: [ping]});
        await Promise.resolve();
        expect(monitor.services.value).toStrictEqual([]);
    });
});
