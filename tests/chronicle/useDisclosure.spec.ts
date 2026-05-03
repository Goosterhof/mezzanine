import {invoke} from '@tauri-apps/api/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useDisclosure} from '../../src/chronicle/useDisclosure';

const mockedInvoke = vi.mocked(invoke);

describe('useDisclosure', () => {
    beforeEach(() => {
        useDisclosure().reset();
        mockedInvoke.mockReset();
    });

    it('loadStatus() flips checked true and stores the ack stamp', async () => {
        mockedInvoke.mockResolvedValueOnce('2026-05-04T08:00:00Z');
        const disclosure = useDisclosure();
        await disclosure.loadStatus();
        expect(disclosure.checked.value).toBe(true);
        expect(disclosure.acknowledgedAt.value).toBe('2026-05-04T08:00:00Z');
        expect(disclosure.needsAcknowledgement()).toBe(false);
    });

    it('needsAcknowledgement is true when status loads as null', async () => {
        mockedInvoke.mockResolvedValueOnce(null);
        const disclosure = useDisclosure();
        await disclosure.loadStatus();
        expect(disclosure.needsAcknowledgement()).toBe(true);
    });

    it('acknowledge() invokes the write command and stores the returned stamp', async () => {
        mockedInvoke.mockResolvedValueOnce(null);
        const disclosure = useDisclosure();
        await disclosure.loadStatus();
        expect(disclosure.needsAcknowledgement()).toBe(true);

        mockedInvoke.mockResolvedValueOnce('2026-05-04T09:00:00Z');
        await disclosure.acknowledge();
        expect(mockedInvoke).toHaveBeenLastCalledWith('write_chronicle_disclosure_ack');
        expect(disclosure.acknowledgedAt.value).toBe('2026-05-04T09:00:00Z');
        expect(disclosure.needsAcknowledgement()).toBe(false);
    });

    it('captures errors during acknowledge() into lastError', async () => {
        mockedInvoke.mockResolvedValueOnce(null);
        const disclosure = useDisclosure();
        await disclosure.loadStatus();

        mockedInvoke.mockRejectedValueOnce(new Error('disk full'));
        await disclosure.acknowledge();
        expect(disclosure.lastError.value).toBe('disk full');
        expect(disclosure.needsAcknowledgement()).toBe(true);
    });
});
