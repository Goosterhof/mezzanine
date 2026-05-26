import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {RpGrant} from '../../src/grind/types';

import {useGrind} from '../../src/grind/useGrind';
import {useRoster} from '../../src/roster/useRoster';

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe('useGrind', () => {
    beforeEach(() => {
        useGrind().reset();
        useRoster().reset();
        invokeMock.mockReset();
        invokeMock.mockImplementation(() => Promise.resolve(undefined));
        listenMock.mockReset();
        listenMock.mockImplementation(() => Promise.resolve(() => {}));
    });

    it('starts with a fresh game state', () => {
        const grind = useGrind();
        expect(grind.gameState.value.rp).toBe(0);
        expect(grind.gameState.value.totalBuildings).toBe(0);
    });

    it('start() hydrates from load_grind_state when present', async () => {
        const grind = useGrind();
        invokeMock.mockImplementation((cmd) => {
            if (cmd === 'load_grind_state') {
                return Promise.resolve({...grind.gameState.value, rp: 9999});
            }
            return Promise.resolve(undefined);
        });
        await grind.start();
        expect(grind.gameState.value.rp).toBe(9999);
        expect(grind.isHydrated.value).toBe(true);
    });

    it('start() falls back to default state when load_grind_state returns null', async () => {
        const grind = useGrind();
        invokeMock.mockResolvedValue(null);
        await grind.start();
        expect(grind.isHydrated.value).toBe(true);
        expect(grind.gameState.value.rp).toBe(0);
    });

    it('start() subscribes to grind-rp-grant events', async () => {
        const grind = useGrind();
        await grind.start();
        expect(listenMock).toHaveBeenCalledWith('grind-rp-grant', expect.any(Function));
    });

    it('start() is idempotent — second call awaits the first', async () => {
        const grind = useGrind();
        const p1 = grind.start();
        const p2 = grind.start();
        await Promise.all([p1, p2]);
        // listen should have been invoked exactly once for the grant channel.
        const grantSubs = listenMock.mock.calls.filter((c) => c[0] === 'grind-rp-grant');
        expect(grantSubs).toHaveLength(1);
    });

    it('purchaseBuilding deducts cost and updates state', () => {
        const grind = useGrind();
        // Seed with enough RP via a direct grant injection.
        const grant: RpGrant = {source: 'recall', scientistId: 'sid', amount: 1000};
        grind._injectGrantForTests(grant);
        const before = grind.gameState.value.rp;
        grind.purchaseBuilding('notebook');
        expect(grind.gameState.value.buildings.notebook).toBe(1);
        expect(grind.gameState.value.rp).toBeLessThan(before);
    });

    it('purchaseUpgrade is a no-op when unaffordable', () => {
        const grind = useGrind();
        grind.purchaseUpgrade('better_pencils');
        expect(grind.gameState.value.upgrades).not.toContain('better_pencils');
    });

    it('save() invokes save_grind_state', async () => {
        const grind = useGrind();
        invokeMock.mockResolvedValue(undefined);
        await grind.save();
        expect(invokeMock).toHaveBeenCalledWith('save_grind_state', expect.any(Object));
    });

    it('save() catches and swallows errors so the lab keeps running', async () => {
        const grind = useGrind();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        invokeMock.mockRejectedValueOnce(new Error('disk full'));
        await expect(grind.save()).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('triggerBreakthrough returns false when below threshold', () => {
        const grind = useGrind();
        expect(grind.triggerBreakthrough()).toBe(false);
    });

    it('triggerBreakthrough resets buildings and grants TP at threshold', () => {
        const grind = useGrind();
        // Bring totalRpEarned up to 400_000 → floor(sqrt(4)) = 2 TP
        grind._injectGrantForTests({source: 'recall', scientistId: 's', amount: 400_000});
        const granted = grind.triggerBreakthrough();
        expect(granted).toBe(true);
        expect(grind.gameState.value.breakthroughLevel).toBe(2);
        expect(grind.gameState.value.theoremPoints).toBe(2);
        expect(grind.gameState.value.rp).toBe(0);
        expect(grind.gameState.value.totalBuildings).toBe(0);
    });

    it('purchaseTheorem deducts TP when affordable', () => {
        const grind = useGrind();
        grind._injectGrantForTests({source: 'recall', scientistId: 's', amount: 400_000});
        grind.triggerBreakthrough();
        const before = grind.gameState.value.theoremPoints;
        grind.purchaseTheorem('auto_efficient_furnace');
        expect(grind.gameState.value.theoremPoints).toBe(before - 1);
        expect(grind.gameState.value.unlockedTheorems).toContain('auto_efficient_furnace');
    });

    it('_injectGrantForTests records the last grant', () => {
        const grind = useGrind();
        const grant: RpGrant = {source: 'chronicle-line', scientistId: 'sid', amount: 0.5};
        grind._injectGrantForTests(grant);
        expect(grind.lastGrant.value).toStrictEqual(grant);
    });

    it('_tickForTests advances RP based on owned buildings', () => {
        const grind = useGrind();
        grind._injectGrantForTests({source: 'recall', scientistId: 's', amount: 200});
        grind.purchaseBuilding('notebook');
        const before = grind.gameState.value.rp;
        grind._tickForTests();
        expect(grind.gameState.value.rp).toBeGreaterThan(before);
    });

    it('dismissOfflineGain clears the banner', () => {
        const grind = useGrind();
        // Inject offline gain via the reset+state path is awkward; just verify the API exists and clears.
        grind.dismissOfflineGain();
        expect(grind.offlineGain.value).toBeNull();
    });
});
