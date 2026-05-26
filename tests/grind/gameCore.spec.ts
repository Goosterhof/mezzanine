import {describe, expect, it} from 'vitest';

import type {GameState} from '../../src/grind/types';

import * as gameCore from '../../src/grind/gameCore';

function freshState(overrides: Partial<GameState> = {}): GameState {
    return {...gameCore.createGameState(), ...overrides};
}

describe('gameCore', () => {
    describe('catalog completeness', () => {
        it('exposes all 8 building tiers', () => {
            expect(gameCore.BUILDINGS).toHaveLength(8);
            const ids = gameCore.BUILDINGS.map((b) => b.id);
            expect(ids).toContain('notebook');
            expect(ids).toContain('dimension_rift');
        });

        it('exposes all 10 upgrades', () => {
            expect(gameCore.UPGRADES).toHaveLength(10);
        });

        it('exposes all 15 milestones', () => {
            expect(gameCore.MILESTONES).toHaveLength(15);
        });

        it('exposes 16 theorem nodes across 4 branches', () => {
            expect(gameCore.TECH_TREE).toHaveLength(16);
            const branches = new Set(gameCore.TECH_TREE.map((t) => t.branch));
            expect(branches.size).toBe(4);
            expect(branches.has('automation')).toBe(true);
            expect(branches.has('quantum')).toBe(true);
            expect(branches.has('chaos')).toBe(true);
            expect(branches.has('dispatch')).toBe(true);
        });

        it('Dispatch branch has 4 nodes', () => {
            const dispatch = gameCore.TECH_TREE.filter((t) => t.branch === 'dispatch');
            expect(dispatch).toHaveLength(4);
            expect(dispatch.map((t) => t.id)).toStrictEqual([
                'dispatch_tireless_bench',
                'dispatch_recall_discipline',
                'dispatch_briefing_library',
                'dispatch_many_hands',
            ]);
        });

        it('Dispatch branch tier costs are 1, 2, 3, 5 TP', () => {
            const dispatch = gameCore.TECH_TREE.filter((t) => t.branch === 'dispatch');
            expect(dispatch.map((t) => t.cost)).toStrictEqual([1, 2, 3, 5]);
        });
    });

    describe('createGameState', () => {
        it('starts at zero RP', () => {
            const s = gameCore.createGameState();
            expect(s.rp).toBe(0);
            expect(s.totalRpEarned).toBe(0);
        });

        it('zeroes all building counts', () => {
            const s = gameCore.createGameState();
            for (const b of gameCore.BUILDINGS) {
                expect(s.buildings[b.id]).toBe(0);
            }
        });

        it('starts with no upgrades, theorems, or milestones', () => {
            const s = gameCore.createGameState();
            expect(s.upgrades).toStrictEqual([]);
            expect(s.unlockedTheorems).toStrictEqual([]);
            expect(s.milestones).toStrictEqual([]);
        });
    });

    describe('getBuildingCost', () => {
        it('returns base cost for 0 owned', () => {
            const def = gameCore.BUILDINGS[0]!;
            expect(gameCore.getBuildingCost(def, 0, [])).toBe(def.baseCost);
        });

        it('scales exponentially per owned', () => {
            const def = gameCore.BUILDINGS[0]!;
            const c0 = gameCore.getBuildingCost(def, 0, []);
            const c5 = gameCore.getBuildingCost(def, 5, []);
            expect(c5).toBeGreaterThan(c0 * Math.pow(def.costScale, 4));
        });

        it('applies Bulk Procurement 10% discount', () => {
            const def = gameCore.BUILDINGS[0]!;
            const full = gameCore.getBuildingCost(def, 0, []);
            const discounted = gameCore.getBuildingCost(def, 0, ['auto_bulk_procurement']);
            expect(discounted).toBeLessThan(full);
        });
    });

    describe('purchaseBuilding', () => {
        it('subtracts cost and increments the owned count', () => {
            const s = freshState({rp: 100});
            const next = gameCore.purchaseBuilding(s, 'notebook');
            expect(next).not.toBeNull();
            expect(next!.rp).toBeLessThan(100);
            expect(next!.buildings.notebook).toBe(1);
            expect(next!.totalBuildings).toBe(1);
        });

        it('returns null when the investor cannot afford it', () => {
            const s = freshState({rp: 0});
            expect(gameCore.purchaseBuilding(s, 'dimension_rift')).toBeNull();
        });

        it('returns null for an unknown building id', () => {
            const s = freshState({rp: 1_000_000});
            // @ts-expect-error — testing the guard.
            expect(gameCore.purchaseBuilding(s, 'not-a-building')).toBeNull();
        });
    });

    describe('purchaseUpgrade', () => {
        it('subtracts the cost and records the upgrade', () => {
            const s = freshState({rp: 10_000});
            const next = gameCore.purchaseUpgrade(s, 'better_pencils');
            expect(next).not.toBeNull();
            expect(next!.upgrades).toContain('better_pencils');
        });

        it('refuses already-owned upgrades', () => {
            const s = freshState({rp: 10_000, upgrades: ['better_pencils']});
            expect(gameCore.purchaseUpgrade(s, 'better_pencils')).toBeNull();
        });

        it('refuses unknown upgrade ids', () => {
            const s = freshState({rp: 10_000});
            expect(gameCore.purchaseUpgrade(s, 'no-such-upgrade')).toBeNull();
        });

        it('refuses when RP is below cost', () => {
            const s = freshState({rp: 0});
            expect(gameCore.purchaseUpgrade(s, 'better_pencils')).toBeNull();
        });
    });

    describe('production', () => {
        it('returns zero RP/s with no buildings', () => {
            const s = gameCore.createGameState();
            expect(gameCore.getTotalRps(s, 0)).toBe(0);
        });

        it('produces RP per second for owned buildings', () => {
            const s = freshState({buildings: {...gameCore.createGameState().buildings, notebook: 10}});
            const rps = gameCore.getTotalRps(s, 0);
            expect(rps).toBe(10 * 0.5);
        });

        it('Tireless Bench scales with concurrent scientists', () => {
            const s = freshState({
                buildings: {...gameCore.createGameState().buildings, notebook: 10},
                unlockedTheorems: ['dispatch_tireless_bench'],
            });
            const baseline = gameCore.getTotalRps(s, 0);
            const withThree = gameCore.getTotalRps(s, 3);
            expect(withThree).toBeGreaterThan(baseline);
            // +10% per concurrent scientist → 3 active = 1.3x baseline
            expect(withThree).toBeCloseTo(baseline * 1.3, 5);
        });

        it('Many Hands adds +15% when 4+ scientists are dispatched and unlocked', () => {
            const s = freshState({
                buildings: {...gameCore.createGameState().buildings, notebook: 10},
                unlockedTheorems: ['dispatch_many_hands'],
            });
            const three = gameCore.getTotalRps(s, 3);
            const four = gameCore.getTotalRps(s, 4);
            expect(four).toBeGreaterThan(three);
        });
    });

    describe('applyGrant', () => {
        it('adds chronicle-line RP and increments the counter', () => {
            const s = gameCore.createGameState();
            const next = gameCore.applyGrant(s, {source: 'chronicle-line', scientistId: 'sid', amount: 0.5});
            expect(next.rp).toBeGreaterThan(0);
            expect(next.totalChronicleLines).toBe(1);
        });

        it('adds dispatch RP and increments the counter', () => {
            const s = gameCore.createGameState();
            const next = gameCore.applyGrant(s, {source: 'dispatch', scientistId: 'sid', amount: 25});
            expect(next.rp).toBeGreaterThan(20);
            expect(next.totalDispatches).toBe(1);
        });

        it('adds recall RP and increments the counter', () => {
            const s = gameCore.createGameState();
            const next = gameCore.applyGrant(s, {source: 'recall', scientistId: 'sid', amount: 100});
            expect(next.rp).toBeGreaterThan(99);
            expect(next.totalCleanRecalls).toBe(1);
        });

        it('mission-duration grants accrue total seconds', () => {
            const s = gameCore.createGameState();
            const next = gameCore.applyGrant(s, {source: 'mission-duration', scientistId: 'sid', amount: 60});
            expect(next.totalMissionSeconds).toBe(60);
        });

        it('quantum_typing doubles chronicle grants', () => {
            const base = gameCore.createGameState();
            const boosted: GameState = {...base, unlockedTheorems: ['quantum_typing']};
            const baseRp = gameCore.applyGrant(base, {source: 'chronicle-line', scientistId: 'sid', amount: 1}).rp;
            const boostedRp = gameCore.applyGrant(boosted, {
                source: 'chronicle-line',
                scientistId: 'sid',
                amount: 1,
            }).rp;
            expect(boostedRp).toBeGreaterThan(baseRp);
        });

        it('dispatch_recall_discipline gives +25% on recall', () => {
            const base = gameCore.createGameState();
            const boosted: GameState = {...base, unlockedTheorems: ['dispatch_recall_discipline']};
            const baseRp = gameCore.applyGrant(base, {source: 'recall', scientistId: 'sid', amount: 100}).rp;
            const boostedRp = gameCore.applyGrant(boosted, {source: 'recall', scientistId: 'sid', amount: 100}).rp;
            expect(boostedRp).toBeCloseTo(baseRp * 1.25, 5);
        });
    });

    describe('tick', () => {
        it('advances RP by rps × delta', () => {
            const s = freshState({buildings: {...gameCore.createGameState().buildings, notebook: 10}});
            const next = gameCore.tick(s, 1, 0);
            expect(next.rp).toBeCloseTo(5, 1);
        });

        it('updates lastTickTime', () => {
            const s = freshState({lastTickTime: 0});
            const next = gameCore.tick(s, 0.1, 0);
            expect(next.lastTickTime).toBeGreaterThan(0);
        });
    });

    describe('prestige', () => {
        it('blocks below threshold', () => {
            const s = freshState({totalRpEarned: 50_000});
            expect(gameCore.canPrestige(s)).toBe(false);
            expect(gameCore.prestige(s)).toBeNull();
        });

        it('grants levels at threshold', () => {
            const s = freshState({totalRpEarned: 400_000});
            expect(gameCore.canPrestige(s)).toBe(true);
            const next = gameCore.prestige(s)!;
            expect(next).not.toBeNull();
            expect(next.breakthroughLevel).toBe(2); // floor(sqrt(4)) = 2
            expect(next.theoremPoints).toBe(2);
            expect(next.totalPrestiges).toBe(1);
        });

        it('preserves theorems across prestige', () => {
            const s = freshState({totalRpEarned: 400_000, unlockedTheorems: ['auto_efficient_furnace']});
            const next = gameCore.prestige(s)!;
            expect(next.unlockedTheorems).toContain('auto_efficient_furnace');
        });

        it('chaos_reality_fracture halves the threshold', () => {
            const s = freshState({unlockedTheorems: ['chaos_reality_fracture']});
            expect(gameCore.getPrestigeThreshold(s)).toBe(50_000);
        });

        it('chaos_controlled_demolition adds 1 bonus level', () => {
            const s = freshState({totalRpEarned: 100_000, unlockedTheorems: ['chaos_controlled_demolition']});
            // floor(sqrt(1)) = 1, +1 bonus = 2
            expect(gameCore.getPrestigeGain(s)).toBe(2);
        });

        it('returns null gain below threshold', () => {
            const s = freshState({totalRpEarned: 1000});
            expect(gameCore.getPrestigeGain(s)).toBe(0);
        });
    });

    describe('milestones', () => {
        it('triggers no milestones on a fresh state', () => {
            const result = gameCore.checkMilestones(gameCore.createGameState());
            expect(result.earned).toHaveLength(0);
        });

        it('triggers first-chronicle at 1 chronicle line', () => {
            const s = freshState({totalChronicleLines: 1});
            const result = gameCore.checkMilestones(s);
            expect(result.earned.some((m) => m.id === 'first_chronicle')).toBe(true);
        });

        it('triggers chain reaction tripling when chaos_chain_reaction owned', () => {
            const baseline = gameCore.checkMilestones(freshState({totalChronicleLines: 100}));
            const tripled = gameCore.checkMilestones(
                freshState({totalChronicleLines: 100, unlockedTheorems: ['chaos_chain_reaction']}),
            );
            const baselineBonus = baseline.newState.rp;
            const tripledBonus = tripled.newState.rp;
            expect(tripledBonus).toBeGreaterThan(baselineBonus);
        });

        it('does not re-grant an already-earned milestone', () => {
            const s = freshState({totalChronicleLines: 1, milestones: ['first_chronicle']});
            const result = gameCore.checkMilestones(s);
            expect(result.earned).toHaveLength(0);
        });
    });

    describe('offline progress', () => {
        it('returns zero when no time has passed', () => {
            const s = freshState({lastTickTime: Date.now()});
            const result = gameCore.applyOfflineProgress(s, 0);
            expect(result.offlineRp).toBe(0);
            expect(result.offlineSeconds).toBe(0);
        });

        it('credits up to 8 hours of passive output', () => {
            const eightHoursAgo = Date.now() - 8 * 3600 * 1000;
            const s = freshState({
                lastTickTime: eightHoursAgo,
                buildings: {...gameCore.createGameState().buildings, notebook: 10},
            });
            const result = gameCore.applyOfflineProgress(s, 0);
            expect(result.offlineSeconds).toBeGreaterThan(28000);
            expect(result.offlineSeconds).toBeLessThanOrEqual(28800);
        });

        it('caps to 16 hours with Extended Shift', () => {
            const twentyHoursAgo = Date.now() - 20 * 3600 * 1000;
            const s = freshState({
                lastTickTime: twentyHoursAgo,
                buildings: {...gameCore.createGameState().buildings, notebook: 10},
                unlockedTheorems: ['auto_extended_shift'],
            });
            const result = gameCore.applyOfflineProgress(s, 0);
            // 16 hours = 57600 s
            expect(result.offlineSeconds).toBeGreaterThan(57000);
            expect(result.offlineSeconds).toBeLessThanOrEqual(57600);
        });
    });

    describe('theorems', () => {
        it('canPurchaseTheorem requires sufficient TP', () => {
            const s = freshState({theoremPoints: 0});
            expect(gameCore.canPurchaseTheorem(s, 'auto_efficient_furnace')).toBe(false);
            const s2 = freshState({theoremPoints: 1});
            expect(gameCore.canPurchaseTheorem(s2, 'auto_efficient_furnace')).toBe(true);
        });

        it('canPurchaseTheorem requires the prerequisite', () => {
            const s = freshState({theoremPoints: 5});
            expect(gameCore.canPurchaseTheorem(s, 'auto_extended_shift')).toBe(false);
        });

        it('canPurchaseTheorem rejects already-owned nodes', () => {
            const s = freshState({theoremPoints: 5, unlockedTheorems: ['auto_efficient_furnace']});
            expect(gameCore.canPurchaseTheorem(s, 'auto_efficient_furnace')).toBe(false);
        });

        it('canPurchaseTheorem rejects unknown ids', () => {
            const s = freshState({theoremPoints: 99});
            expect(gameCore.canPurchaseTheorem(s, 'not-a-theorem')).toBe(false);
        });

        it('purchaseTheorem deducts cost and records id', () => {
            const s = freshState({theoremPoints: 5});
            const next = gameCore.purchaseTheorem(s, 'auto_efficient_furnace')!;
            expect(next).not.toBeNull();
            expect(next.theoremPoints).toBe(4);
            expect(next.unlockedTheorems).toContain('auto_efficient_furnace');
        });

        it('purchaseTheorem returns null when blocked', () => {
            const s = freshState({theoremPoints: 0});
            expect(gameCore.purchaseTheorem(s, 'auto_efficient_furnace')).toBeNull();
        });

        it('getVisibleTheorems shows root nodes plus unlocked branches', () => {
            const fresh = gameCore.getVisibleTheorems([]);
            // Four root nodes (tier 1 of each branch).
            const roots = fresh.filter((t) => t.requires === null);
            expect(roots).toHaveLength(4);
            const withTier1 = gameCore.getVisibleTheorems(['auto_efficient_furnace']);
            expect(withTier1.some((t) => t.id === 'auto_extended_shift')).toBe(true);
        });
    });

    describe('formatting', () => {
        it('formatNumber renders small numbers as fixed', () => {
            expect(gameCore.formatNumber(3.5)).toBe('3.5');
            expect(gameCore.formatNumber(999)).toBe('999');
        });

        it('formatNumber renders K/M/B/T suffixes', () => {
            expect(gameCore.formatNumber(1500)).toBe('1.5K');
            expect(gameCore.formatNumber(2_500_000)).toBe('2.50M');
            expect(gameCore.formatNumber(3_500_000_000)).toBe('3.50B');
            expect(gameCore.formatNumber(4_500_000_000_000)).toBe('4.50T');
        });

        it('formatDuration renders s/m/h', () => {
            expect(gameCore.formatDuration(30)).toBe('30s');
            expect(gameCore.formatDuration(125)).toBe('2m 5s');
            expect(gameCore.formatDuration(3725)).toBe('1h 2m');
        });
    });

    describe('visibility helpers', () => {
        it('getVisibleBuildings filters by unlockAt', () => {
            expect(gameCore.getVisibleBuildings(0)).toHaveLength(1); // notebook only
            expect(gameCore.getVisibleBuildings(75_000_000)).toHaveLength(8);
        });

        it('getVisibleUpgrades hides purchased upgrades', () => {
            const visible = gameCore.getVisibleUpgrades(1000, ['better_pencils']);
            expect(visible.some((u) => u.id === 'better_pencils')).toBe(false);
        });
    });

    describe('resolveGrantMultiplier', () => {
        it('returns the prestige multiplier on a fresh state', () => {
            const s = gameCore.createGameState();
            expect(gameCore.resolveGrantMultiplier('chronicle-line', s)).toBe(1);
        });

        it('factors in matching upgrade target', () => {
            const s = freshState({upgrades: ['chronicle_efficiency']});
            const mult = gameCore.resolveGrantMultiplier('chronicle-line', s);
            expect(mult).toBeCloseTo(2, 5);
        });

        it('factors in the global upgrade', () => {
            const s = freshState({upgrades: ['global_bonus']});
            const mult = gameCore.resolveGrantMultiplier('dispatch', s);
            expect(mult).toBeCloseTo(1.5, 5);
        });
    });
});
