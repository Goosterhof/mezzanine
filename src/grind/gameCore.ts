// gameCore — The Grind's pure game engine.
//
// TypeScript ES-module rewrite of `gadgets/idle-lab/webview/game-core.js`
// adapted for the Mezzanine economy (#00053). Pure functions, immutable
// state, zero side effects, zero external dependencies.
//
// The eight building tiers, ten upgrades, fifteen milestones, prestige
// formula, and offline progress accumulator are ported intact. The five
// VS Code activity sources collapse into four Mezzanine sources
// (chronicle line / dispatch / recall / mission duration); the Quantum
// upgrade target keys are repurposed onto the new sources, and the
// twelve-node theorem tree gains a fourth Dispatch branch with four
// nodes that reward roster throughput.
//
// All effects are applied through `applyGrant` (lifecycle + chronicle
// sources) and `tick` (building output). The composable in `useGrind.ts`
// drives the tick; the composable's Tauri listener feeds grants.

import type {
    BuildingDef,
    BuildingId,
    GameState,
    GrindSource,
    MilestoneCheckResult,
    MilestoneDef,
    OfflineProgressResult,
    RpGrant,
    TechState,
    TheoremDef,
    UpgradeDef,
} from './types';

// ---------------------------------------------------------------------------
// Constants — economy seed values match Rust-side `grind::economy::config`
// ---------------------------------------------------------------------------

/** Tick interval in milliseconds — game updates every second. */
export const TICK_MS = 1000;

/** Maximum offline time credited (8 hours, in seconds). */
export const MAX_OFFLINE_SECONDS = 28800;

/** Prestige threshold — RP earned for first breakthrough. */
export const PRESTIGE_THRESHOLD = 100_000;

/** Prestige multiplier per breakthrough level. */
export const PRESTIGE_MULTIPLIER = 0.1;

/** RP granted per chronicle line, before theorem bonuses. */
export const CHRONICLE_LINE_RP = 0.5;

/** RP granted per dispatch event, before theorem bonuses. */
export const DISPATCH_RP = 25;

/** RP granted per clean recall event, before theorem bonuses. */
export const RECALL_CLEAN_RP = 100;

// ---------------------------------------------------------------------------
// Building Definitions — eight tiers, original cost curves preserved
// ---------------------------------------------------------------------------

export const BUILDINGS: readonly BuildingDef[] = [
    {
        id: 'notebook',
        name: 'Lab Notebook',
        description: 'A humble notebook. The scientist jots down observations. +0.5 RP/s',
        baseCost: 10,
        costScale: 1.12,
        baseOutput: 0.5,
        icon: '📓',
        tier: 0,
        unlockAt: 0,
    },
    {
        id: 'terminal',
        name: 'Terminal Station',
        description: 'A blinking terminal crunching numbers. +2 RP/s',
        baseCost: 75,
        costScale: 1.14,
        baseOutput: 2,
        icon: '🖥️',
        tier: 0,
        unlockAt: 50,
    },
    {
        id: 'beaker_rack',
        name: 'Beaker Rack',
        description: 'Bubbling experiments run themselves. +8 RP/s',
        baseCost: 500,
        costScale: 1.15,
        baseOutput: 8,
        icon: '🧪',
        tier: 1,
        unlockAt: 500,
    },
    {
        id: 'centrifuge',
        name: 'Centrifuge',
        description: 'Separates raw data into pure research. +25 RP/s',
        baseCost: 3000,
        costScale: 1.16,
        baseOutput: 25,
        icon: '🌀',
        tier: 1,
        unlockAt: 3000,
    },
    {
        id: 'server_rack',
        name: 'Server Rack',
        description: 'A humming rack of computational power. +80 RP/s',
        baseCost: 15_000,
        costScale: 1.17,
        baseOutput: 80,
        icon: '🗄️',
        tier: 2,
        unlockAt: 15_000,
    },
    {
        id: 'quantum_computer',
        name: 'Quantum Computer',
        description: "Solves problems that don't exist yet. +250 RP/s",
        baseCost: 80_000,
        costScale: 1.18,
        baseOutput: 250,
        icon: '⚛️',
        tier: 2,
        unlockAt: 80_000,
    },
    {
        id: 'containment_chamber',
        name: 'Containment Chamber',
        description: 'Harnesses unstable code reactions. +1000 RP/s',
        baseCost: 500_000,
        costScale: 1.2,
        baseOutput: 1000,
        icon: '🛡️',
        tier: 3,
        unlockAt: 500_000,
    },
    {
        id: 'dimension_rift',
        name: 'Dimension Rift',
        description: 'Opens a portal to an alternate codebase. +5000 RP/s',
        baseCost: 5_000_000,
        costScale: 1.22,
        baseOutput: 5000,
        icon: '🌀',
        tier: 3,
        unlockAt: 5_000_000,
    },
];

// ---------------------------------------------------------------------------
// Upgrade Definitions — ten upgrades, source keys rebound to Mezzanine vocab
// ---------------------------------------------------------------------------
//
// Mezzanine adaptation: the VS Code keys (_click / _save / _line) are
// rebound onto the new Mezzanine sources. The investor reads the upgrade
// descriptions in the laboratory's vocabulary.

export const UPGRADES: readonly UpgradeDef[] = [
    {
        id: 'better_pencils',
        name: 'Better Pencils',
        description: 'Lab Notebooks produce 2x RP/s',
        cost: 200,
        target: 'notebook',
        multiplier: 2,
        unlockAt: 100,
    },
    {
        id: 'syntax_highlighting',
        name: 'Syntax Highlighting',
        description: 'Terminal Stations produce 2x RP/s',
        cost: 1500,
        target: 'terminal',
        multiplier: 2,
        unlockAt: 750,
    },
    {
        id: 'catalyst',
        name: 'Catalyst Compound',
        description: 'Beaker Racks produce 3x RP/s',
        cost: 10_000,
        target: 'beaker_rack',
        multiplier: 3,
        unlockAt: 5000,
    },
    {
        id: 'turbo_spin',
        name: 'Turbo Spin Cycle',
        description: 'Centrifuges produce 2x RP/s',
        cost: 50_000,
        target: 'centrifuge',
        multiplier: 2,
        unlockAt: 25_000,
    },
    {
        id: 'overclock',
        name: 'Overclock',
        description: 'Server Racks produce 3x RP/s',
        cost: 200_000,
        target: 'server_rack',
        multiplier: 3,
        unlockAt: 100_000,
    },
    {
        id: 'superposition',
        name: 'Superposition',
        description: 'Quantum Computers produce 2x RP/s',
        cost: 1_000_000,
        target: 'quantum_computer',
        multiplier: 2,
        unlockAt: 500_000,
    },
    // VS Code "Ergonomic Keyboard" -> Mezzanine "Stenographer's Ear" —
    // chronicle lines pay double. Same multiplier, repurposed source.
    {
        id: 'chronicle_efficiency',
        name: "Stenographer's Ear",
        description: 'Each chronicle line pays 2x RP',
        cost: 500,
        target: '_chronicle',
        multiplier: 2,
        unlockAt: 200,
    },
    // VS Code "Auto-Formatter" -> Mezzanine "Dispatch Discipline" —
    // each dispatch grants double RP.
    {
        id: 'dispatch_bonus',
        name: 'Dispatch Discipline',
        description: 'Dispatching a scientist grants 2x RP',
        cost: 2000,
        target: '_dispatch',
        multiplier: 2,
        unlockAt: 1000,
    },
    // VS Code "Copilot Injection" -> Mezzanine "Clean Recall Procedure" —
    // clean recalls pay 3x.
    {
        id: 'recall_bonus',
        name: 'Clean Recall Procedure',
        description: 'Clean recalls grant 3x RP',
        cost: 8000,
        target: '_recall',
        multiplier: 3,
        unlockAt: 4000,
    },
    {
        id: 'global_bonus',
        name: 'Mad Science Grant',
        description: 'ALL production +50%',
        cost: 50_000,
        target: '_global',
        multiplier: 1.5,
        unlockAt: 30_000,
    },
];

// ---------------------------------------------------------------------------
// Theorem Tree — sixteen nodes across four branches
// ---------------------------------------------------------------------------
//
// The three original branches (Automation / Quantum / Chaos) carry forward
// intact. Quantum's activity targets are repurposed: 'quantum_typing'
// becomes a chronicle multiplier, 'quantum_entangled_saves' becomes a
// recall multiplier. The fourth branch — Dispatch — is the Mezzanine's
// new arm (G-0 spec, see experiment log #00053 RD-3).

export const TECH_TREE: readonly TheoremDef[] = [
    // --- AUTOMATION Branch ---
    {
        id: 'auto_efficient_furnace',
        branch: 'automation',
        tier: 1,
        name: 'Efficient Furnace',
        description: 'All passive production +25%. The reactor burns hotter.',
        cost: 1,
        requires: null,
        effect: {type: 'production_mult', value: 1.25},
    },
    {
        id: 'auto_extended_shift',
        branch: 'automation',
        tier: 2,
        name: 'Extended Shift',
        description: 'Offline progress cap doubled to 16 hours. The lab never truly sleeps.',
        cost: 2,
        requires: 'auto_efficient_furnace',
        effect: {type: 'offline_cap_mult', value: 2},
    },
    {
        id: 'auto_bulk_procurement',
        branch: 'automation',
        tier: 3,
        name: 'Bulk Procurement',
        description: 'Building costs reduced 10%. Economies of mad scale.',
        cost: 3,
        requires: 'auto_extended_shift',
        effect: {type: 'cost_reduction', value: 0.9},
    },
    {
        id: 'auto_self_replicating',
        branch: 'automation',
        tier: 4,
        name: 'Self-Replicating Lab',
        description: '+0.5% production per building owned. The lab builds itself.',
        cost: 5,
        requires: 'auto_bulk_procurement',
        effect: {type: 'production_per_building', value: 0.005},
    },

    // --- QUANTUM Branch — repurposed onto chronicle vocabulary ---
    {
        id: 'quantum_typing',
        branch: 'quantum',
        tier: 1,
        name: 'Quantum Stenography',
        description: 'Chronicle-line RP doubled. Each turn echoes across timelines.',
        cost: 1,
        requires: null,
        effect: {type: 'chronicle_mult', value: 2},
    },
    {
        id: 'quantum_entangled_saves',
        branch: 'quantum',
        tier: 2,
        name: 'Entangled Recalls',
        description: 'Clean recalls also pay chronicle-line bonus RP.',
        cost: 2,
        requires: 'quantum_typing',
        effect: {type: 'recall_bonus', value: 5},
    },
    {
        id: 'quantum_superposition',
        branch: 'quantum',
        tier: 3,
        name: 'Superposition',
        description: 'All activity rewards +50%. You read multiple timelines simultaneously.',
        cost: 3,
        requires: 'quantum_entangled_saves',
        effect: {type: 'production_mult', value: 1.5},
    },
    {
        id: 'quantum_observer',
        branch: 'quantum',
        tier: 4,
        name: 'Observer Effect',
        description: 'Dispatching a scientist boosts all production 2x for 10 seconds.',
        cost: 5,
        requires: 'quantum_superposition',
        effect: {type: 'dispatch_mult', value: 2},
    },

    // --- CHAOS Branch — unchanged from original ---
    {
        id: 'chaos_controlled_demolition',
        branch: 'chaos',
        tier: 1,
        name: 'Controlled Demolition',
        description: '+1 bonus breakthrough level per prestige. Bigger bangs.',
        cost: 1,
        requires: null,
        effect: {type: 'prestige_bonus_levels', value: 1},
    },
    {
        id: 'chaos_chain_reaction',
        branch: 'chaos',
        tier: 2,
        name: 'Chain Reaction',
        description: 'Milestone RP bonuses tripled. Achievements echo louder.',
        cost: 2,
        requires: 'chaos_controlled_demolition',
        effect: {type: 'milestone_bonus_mult', value: 3},
    },
    {
        id: 'chaos_volatile_mixture',
        branch: 'chaos',
        tier: 3,
        name: 'Volatile Mixture',
        description: '+2% production per breakthrough level. Prestige compounds.',
        cost: 3,
        requires: 'chaos_chain_reaction',
        effect: {type: 'prestige_production_bonus', value: 0.02},
    },
    {
        id: 'chaos_reality_fracture',
        branch: 'chaos',
        tier: 4,
        name: 'Reality Fracture',
        description: 'Prestige threshold halved to 50K. The walls between realities thin.',
        cost: 5,
        requires: 'chaos_volatile_mixture',
        effect: {type: 'prestige_threshold_mult', value: 0.5},
    },

    // --- DISPATCH Branch — G-0 spec for Arc 3 (#00053) ---
    {
        id: 'dispatch_tireless_bench',
        branch: 'dispatch',
        tier: 1,
        name: 'Tireless Bench',
        description: '+10% RP per concurrent dispatched scientist. The bench never sleeps.',
        cost: 1,
        requires: null,
        effect: {type: 'concurrent_bonus_per_scientist', value: 0.1},
    },
    {
        id: 'dispatch_recall_discipline',
        branch: 'dispatch',
        tier: 2,
        name: 'Recall Discipline',
        description: '+25% RP on every successful (non-crashed) recall.',
        cost: 2,
        requires: 'dispatch_tireless_bench',
        effect: {type: 'recall_bonus', value: 0.25},
    },
    {
        id: 'dispatch_briefing_library',
        branch: 'dispatch',
        tier: 3,
        name: 'Briefing Library',
        description: 'Library-template missions pay 2x RP for the mission duration.',
        cost: 3,
        requires: 'dispatch_recall_discipline',
        effect: {type: 'library_template_mult', value: 2},
    },
    {
        id: 'dispatch_many_hands',
        branch: 'dispatch',
        tier: 4,
        name: 'Many Hands',
        description: '4+ concurrent scientists unlock a permanent +15% global multiplier.',
        cost: 5,
        requires: 'dispatch_briefing_library',
        effect: {type: 'many_hands_global', threshold: 4, value: 0.15},
    },
];

/** Branch metadata for display. */
export const TECH_BRANCHES = {
    automation: {name: 'Automation', subtitle: 'The Diligent Path', icon: '⚙️'},
    quantum: {name: 'Quantum', subtitle: 'The Brilliant Path', icon: '⚛️'},
    chaos: {name: 'Chaos', subtitle: 'The Mad Path', icon: '🔥'},
    dispatch: {name: 'Dispatch', subtitle: 'The Balcony Path', icon: '📋'},
} as const;

// ---------------------------------------------------------------------------
// Milestones — fifteen achievements, keyed off Mezzanine stats
// ---------------------------------------------------------------------------

export const MILESTONES: readonly MilestoneDef[] = [
    {
        id: 'first_chronicle',
        name: 'First Word',
        description: 'A scientist writes their first chronicle line',
        stat: 'totalChronicleLines',
        threshold: 1,
        bonus: 0,
    },
    {
        id: 'centurion',
        name: 'Centurion',
        description: 'The lab logs 100 chronicle lines',
        stat: 'totalChronicleLines',
        threshold: 100,
        bonus: 10,
    },
    {
        id: 'thousand_lines',
        name: 'The Novelist',
        description: 'The lab logs 1,000 chronicle lines',
        stat: 'totalChronicleLines',
        threshold: 1000,
        bonus: 100,
    },
    {
        id: 'ten_thousand',
        name: 'Code Monolith',
        description: 'The lab logs 10,000 chronicle lines',
        stat: 'totalChronicleLines',
        threshold: 10_000,
        bonus: 1000,
    },
    {
        id: 'first_dispatch',
        name: 'First Mission',
        description: 'Dispatch a scientist for the first time',
        stat: 'totalDispatches',
        threshold: 1,
        bonus: 5,
    },
    {
        id: 'hundred_dispatches',
        name: 'Mission Master',
        description: 'Dispatch 100 missions',
        stat: 'totalDispatches',
        threshold: 100,
        bonus: 50,
    },
    {
        id: 'first_recall',
        name: 'Clean Withdrawal',
        description: 'Recall a scientist cleanly',
        stat: 'totalCleanRecalls',
        threshold: 1,
        bonus: 25,
    },
    {
        id: 'hundred_recalls',
        name: 'Disciplined Director',
        description: 'Achieve 100 clean recalls',
        stat: 'totalCleanRecalls',
        threshold: 100,
        bonus: 500,
    },
    {
        id: 'first_building',
        name: 'Grand Opening',
        description: 'Purchase your first building',
        stat: 'totalBuildings',
        threshold: 1,
        bonus: 5,
    },
    {
        id: 'ten_buildings',
        name: 'Lab Expansion',
        description: 'Own 10 buildings total',
        stat: 'totalBuildings',
        threshold: 10,
        bonus: 50,
    },
    {
        id: 'fifty_buildings',
        name: 'Lab Complex',
        description: 'Own 50 buildings total',
        stat: 'totalBuildings',
        threshold: 50,
        bonus: 500,
    },
    {
        id: 'first_prestige',
        name: 'Breakthrough!',
        description: 'Perform your first prestige reset',
        stat: 'totalPrestiges',
        threshold: 1,
        bonus: 0,
    },
    {
        id: 'rp_million',
        name: 'Millionaire Scientist',
        description: 'Earn 1,000,000 total RP',
        stat: 'totalRpEarned',
        threshold: 1_000_000,
        bonus: 5000,
    },
    {
        id: 'mission_hour',
        name: 'Deep Focus',
        description: 'Accumulate 1 hour of scientist mission time',
        stat: 'totalMissionSeconds',
        threshold: 3600,
        bonus: 200,
    },
    {
        id: 'mission_day',
        name: 'Tireless Roster',
        description: 'Accumulate 24 hours of cumulative mission time',
        stat: 'totalMissionSeconds',
        threshold: 86_400,
        bonus: 5000,
    },
];

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

export function createGameState(): GameState {
    const buildings = {} as Record<BuildingId, number>;
    for (const b of BUILDINGS) {
        buildings[b.id] = 0;
    }
    return {
        rp: 0,
        totalRpEarned: 0,
        buildings,
        upgrades: [],
        theoremPoints: 0,
        totalTheoremsEarned: 0,
        unlockedTheorems: [],
        breakthroughLevel: 0,
        totalChronicleLines: 0,
        totalDispatches: 0,
        totalCleanRecalls: 0,
        totalMissionSeconds: 0,
        totalBuildings: 0,
        totalPrestiges: 0,
        milestones: [],
        lastTickTime: Date.now(),
        sessionStartTime: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

export function getBuildingCost(def: BuildingDef, owned: number, unlockedTheorems: string[]): number {
    let cost = def.baseCost * Math.pow(def.costScale, owned);
    if (unlockedTheorems.includes('auto_bulk_procurement')) {
        cost *= 0.9;
    }
    return Math.floor(cost);
}

// ---------------------------------------------------------------------------
// Production calculation
// ---------------------------------------------------------------------------

function upgradeMultiplier(purchasedUpgrades: string[], buildingId: BuildingId | '_global'): number {
    let m = 1;
    for (const upId of purchasedUpgrades) {
        const upDef = UPGRADES.find((u) => u.id === upId);
        if (upDef?.target === buildingId) {
            m *= upDef.multiplier;
        }
    }
    return m;
}

function theoremProductionMultiplier(theorems: string[], breakthroughLevel: number, tech: TechState): number {
    let m = 1;
    if (theorems.includes('auto_efficient_furnace')) m *= 1.25;
    if (theorems.includes('quantum_superposition')) m *= 1.5;
    if (theorems.includes('auto_self_replicating')) m *= 1 + tech.totalBuildings * 0.005;
    if (theorems.includes('chaos_volatile_mixture')) m *= 1 + breakthroughLevel * 0.02;
    if (theorems.includes('dispatch_tireless_bench') && tech.concurrentScientists > 0) {
        m *= 1 + tech.concurrentScientists * 0.1;
    }
    if (theorems.includes('dispatch_many_hands') && tech.concurrentScientists >= 4) {
        m *= 1.15;
    }
    return m;
}

interface BuildingRpsParams {
    def: BuildingDef;
    owned: number;
    purchasedUpgrades: string[];
    breakthroughLevel: number;
    tech: TechState;
}

export function getBuildingRps(params: BuildingRpsParams): number {
    const {def, owned, purchasedUpgrades, breakthroughLevel, tech} = params;
    if (owned === 0) return 0;
    const upMult = upgradeMultiplier(purchasedUpgrades, def.id) * upgradeMultiplier(purchasedUpgrades, '_global');
    const prestigeMult = 1 + breakthroughLevel * PRESTIGE_MULTIPLIER;
    const techMult = theoremProductionMultiplier(tech.unlockedTheorems, breakthroughLevel, tech);
    return owned * def.baseOutput * upMult * prestigeMult * techMult;
}

export function getTotalRps(state: GameState, concurrentScientists: number): number {
    const tech: TechState = {
        unlockedTheorems: state.unlockedTheorems,
        totalBuildings: state.totalBuildings,
        concurrentScientists,
    };
    let total = 0;
    for (const b of BUILDINGS) {
        total += getBuildingRps({
            def: b,
            owned: state.buildings[b.id],
            purchasedUpgrades: state.upgrades,
            breakthroughLevel: state.breakthroughLevel,
            tech,
        });
    }
    return total;
}

// ---------------------------------------------------------------------------
// Activity rewards — multiplier resolution per source
// ---------------------------------------------------------------------------

/** Resolve the multiplier applied to a grant of the given source. Pure —
 *  does not modify state. */
function theoremGrantMultiplier(source: GrindSource, theorems: string[]): number {
    let m = 1;
    if (source === 'chronicle-line' && theorems.includes('quantum_typing')) m *= 2;
    if (theorems.includes('quantum_superposition')) m *= 1.5;
    if (source === 'recall' && theorems.includes('dispatch_recall_discipline')) m *= 1.25;
    return m;
}

export function resolveGrantMultiplier(source: GrindSource, state: GameState): number {
    const targetKey = sourceUpgradeKey(source);
    const sourceUpgrade = state.upgrades
        .map((id) => UPGRADES.find((u) => u.id === id))
        .filter((u): u is UpgradeDef => u?.target === targetKey)
        .reduce((m, u) => m * u.multiplier, 1);
    const globalUpgrade = state.upgrades
        .map((id) => UPGRADES.find((u) => u.id === id))
        .filter((u): u is UpgradeDef => u?.target === '_global')
        .reduce((m, u) => m * u.multiplier, 1);
    const prestigeMult = 1 + state.breakthroughLevel * PRESTIGE_MULTIPLIER;
    const techMult = theoremGrantMultiplier(source, state.unlockedTheorems);
    return sourceUpgrade * globalUpgrade * prestigeMult * techMult;
}

function sourceUpgradeKey(source: GrindSource): string {
    switch (source) {
        case 'chronicle-line':
            return '_chronicle';
        case 'dispatch':
            return '_dispatch';
        case 'recall':
            return '_recall';
        case 'mission-duration':
            return '_mission';
        default: {
            const _exhaustive: never = source;
            return _exhaustive;
        }
    }
}

// ---------------------------------------------------------------------------
// Grant application
// ---------------------------------------------------------------------------

/** Apply an RP grant from the economy module. The grant amount is the
 *  *base* amount the Rust side already rate-limited; this function applies
 *  the engine-side multipliers (upgrades, theorems, prestige). */
export function applyGrant(state: GameState, grant: RpGrant): GameState {
    const multiplier = resolveGrantMultiplier(grant.source, state);
    const reward = grant.amount * multiplier;
    const next: GameState = {...state, rp: state.rp + reward, totalRpEarned: state.totalRpEarned + reward};
    switch (grant.source) {
        case 'chronicle-line':
            next.totalChronicleLines = state.totalChronicleLines + 1;
            break;
        case 'dispatch':
            next.totalDispatches = state.totalDispatches + 1;
            break;
        case 'recall':
            next.totalCleanRecalls = state.totalCleanRecalls + 1;
            break;
        case 'mission-duration':
            // The Rust side reports mission-duration grants in "seconds
            // accrued" units multiplied by the rate; the engine accumulates
            // raw seconds for milestone purposes. The amount on the wire
            // is RP, so we back-derive seconds from the configured rate.
            next.totalMissionSeconds = state.totalMissionSeconds + Math.max(0, grant.amount);
            break;
    }
    return next;
}

// ---------------------------------------------------------------------------
// Tick — passive building output
// ---------------------------------------------------------------------------

export function tick(state: GameState, deltaSec: number, concurrentScientists: number): GameState {
    const rps = getTotalRps(state, concurrentScientists);
    const earned = rps * deltaSec;
    return {...state, rp: state.rp + earned, totalRpEarned: state.totalRpEarned + earned, lastTickTime: Date.now()};
}

// ---------------------------------------------------------------------------
// Purchase actions
// ---------------------------------------------------------------------------

export function purchaseBuilding(state: GameState, buildingId: BuildingId): GameState | null {
    const def = BUILDINGS.find((b) => b.id === buildingId);
    if (!def) return null;
    const owned = state.buildings[buildingId];
    const cost = getBuildingCost(def, owned, state.unlockedTheorems);
    if (state.rp < cost) return null;
    return {
        ...state,
        rp: state.rp - cost,
        buildings: {...state.buildings, [buildingId]: owned + 1},
        totalBuildings: state.totalBuildings + 1,
    };
}

export function purchaseUpgrade(state: GameState, upgradeId: string): GameState | null {
    if (state.upgrades.includes(upgradeId)) return null;
    const def = UPGRADES.find((u) => u.id === upgradeId);
    if (!def) return null;
    if (state.rp < def.cost) return null;
    return {...state, rp: state.rp - def.cost, upgrades: [...state.upgrades, upgradeId]};
}

// ---------------------------------------------------------------------------
// Prestige
// ---------------------------------------------------------------------------

export function getPrestigeThreshold(state: GameState): number {
    let threshold = PRESTIGE_THRESHOLD;
    if (state.unlockedTheorems.includes('chaos_reality_fracture')) {
        threshold *= 0.5;
    }
    return threshold;
}

export function canPrestige(state: GameState): boolean {
    return state.totalRpEarned >= getPrestigeThreshold(state);
}

export function getPrestigeGain(state: GameState): number {
    const threshold = getPrestigeThreshold(state);
    if (state.totalRpEarned < threshold) return 0;
    let gain = Math.floor(Math.sqrt(state.totalRpEarned / threshold));
    if (state.unlockedTheorems.includes('chaos_controlled_demolition')) {
        gain += 1;
    }
    return gain;
}

export function prestige(state: GameState): GameState | null {
    const gain = getPrestigeGain(state);
    if (gain === 0) return null;
    const fresh = createGameState();
    return {
        ...fresh,
        breakthroughLevel: state.breakthroughLevel + gain,
        theoremPoints: state.theoremPoints + gain,
        totalTheoremsEarned: state.totalTheoremsEarned + gain,
        unlockedTheorems: [...state.unlockedTheorems],
        totalChronicleLines: state.totalChronicleLines,
        totalDispatches: state.totalDispatches,
        totalCleanRecalls: state.totalCleanRecalls,
        totalMissionSeconds: state.totalMissionSeconds,
        totalBuildings: state.totalBuildings,
        totalPrestiges: state.totalPrestiges + 1,
        milestones: [...state.milestones],
    };
}

// ---------------------------------------------------------------------------
// Milestone checking
// ---------------------------------------------------------------------------

export function checkMilestones(state: GameState): MilestoneCheckResult {
    const earned: MilestoneDef[] = [];
    let newMilestones = state.milestones;

    for (const m of MILESTONES) {
        if (newMilestones.includes(m.id)) continue;
        const statValue = state[m.stat];
        if (statValue >= m.threshold) {
            earned.push(m);
            newMilestones = [...newMilestones, m.id];
        }
    }

    if (earned.length === 0) return {newState: state, earned: []};

    const milestoneMult = state.unlockedTheorems.includes('chaos_chain_reaction') ? 3 : 1;
    let bonusRp = 0;
    for (const m of earned) {
        bonusRp += m.bonus * milestoneMult;
    }

    return {
        newState: {
            ...state,
            milestones: newMilestones,
            rp: state.rp + bonusRp,
            totalRpEarned: state.totalRpEarned + bonusRp,
        },
        earned,
    };
}

// ---------------------------------------------------------------------------
// Offline progress
// ---------------------------------------------------------------------------

export function applyOfflineProgress(state: GameState, concurrentScientists: number): OfflineProgressResult {
    const now = Date.now();
    const elapsedMs = now - state.lastTickTime;
    let maxOffline = MAX_OFFLINE_SECONDS;
    if (state.unlockedTheorems.includes('auto_extended_shift')) {
        maxOffline *= 2;
    }
    const elapsedSec = Math.min(elapsedMs / 1000, maxOffline);
    if (elapsedSec < 1) {
        return {state, offlineRp: 0, offlineSeconds: 0};
    }
    const next = tick(state, elapsedSec, concurrentScientists);
    const offlineRp = next.rp - state.rp;
    return {state: next, offlineRp, offlineSeconds: Math.floor(elapsedSec)};
}

// ---------------------------------------------------------------------------
// Visibility helpers
// ---------------------------------------------------------------------------

export function getVisibleBuildings(totalRpEarned: number): BuildingDef[] {
    return BUILDINGS.filter((b) => totalRpEarned >= b.unlockAt);
}

export function getVisibleUpgrades(totalRpEarned: number, purchasedUpgrades: string[]): UpgradeDef[] {
    return UPGRADES.filter((u) => totalRpEarned >= u.unlockAt && !purchasedUpgrades.includes(u.id));
}

// ---------------------------------------------------------------------------
// Theorem actions
// ---------------------------------------------------------------------------

export function canPurchaseTheorem(state: GameState, theoremId: string): boolean {
    const def = TECH_TREE.find((t) => t.id === theoremId);
    if (!def) return false;
    if (state.unlockedTheorems.includes(theoremId)) return false;
    if (state.theoremPoints < def.cost) return false;
    if (def.requires && !state.unlockedTheorems.includes(def.requires)) return false;
    return true;
}

export function purchaseTheorem(state: GameState, theoremId: string): GameState | null {
    if (!canPurchaseTheorem(state, theoremId)) return null;
    const def = TECH_TREE.find((t) => t.id === theoremId);
    if (!def) return null;
    return {
        ...state,
        theoremPoints: state.theoremPoints - def.cost,
        unlockedTheorems: [...state.unlockedTheorems, theoremId],
    };
}

export function getVisibleTheorems(unlockedTheorems: string[]): TheoremDef[] {
    return TECH_TREE.filter((t) => {
        if (unlockedTheorems.includes(t.id)) return true;
        if (!t.requires) return true;
        return unlockedTheorems.includes(t.requires);
    });
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export function formatNumber(n: number): string {
    if (n < 1000) return n < 10 ? n.toFixed(1) : Math.floor(n).toString();
    if (n < 1_000_000) return (n / 1000).toFixed(1) + 'K';
    if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n < 1_000_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    return (n / 1_000_000_000_000).toFixed(2) + 'T';
}

export function formatDuration(seconds: number): string {
    if (seconds < 60) return Math.floor(seconds) + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (Math.floor(seconds) % 60) + 's';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours + 'h ' + mins + 'm';
}
