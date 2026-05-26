// The Grind's wire-type surface — mirrors the Rust side at
// `src-tauri/src/grind/economy.rs` plus the engine state shape in
// `gameCore.ts`. The engine is the source of truth for `GameState`; the
// Rust side stores it as an opaque `serde_json::Value`.

import type {ScientistId} from '../roster/types';

/** The four RP sources — matches `GrindSource` in Rust (kebab-case wire form). */
export type GrindSource = 'chronicle-line' | 'dispatch' | 'recall' | 'mission-duration';

/** One RP grant — matches the `grind-rp-grant` event payload from Rust. */
export interface RpGrant {
    source: GrindSource;
    scientistId: ScientistId | null;
    amount: number;
}

/** The eight building tiers — id strings stable for game-state round-trip. */
export type BuildingId =
    | 'notebook'
    | 'terminal'
    | 'beaker_rack'
    | 'centrifuge'
    | 'server_rack'
    | 'quantum_computer'
    | 'containment_chamber'
    | 'dimension_rift';

/** Tier — visual band on the lab scene. */
export type BuildingTier = 0 | 1 | 2 | 3;

export interface BuildingDef {
    id: BuildingId;
    name: string;
    description: string;
    baseCost: number;
    costScale: number;
    baseOutput: number;
    icon: string;
    tier: BuildingTier;
    unlockAt: number;
}

/** Upgrade target — either a specific building id, or a domain meta-key
 *  the engine knows about (chronicle, dispatch, recall, mission duration,
 *  global). */
export type UpgradeTarget = BuildingId | '_chronicle' | '_dispatch' | '_recall' | '_mission' | '_global';

export interface UpgradeDef {
    id: string;
    name: string;
    description: string;
    cost: number;
    target: UpgradeTarget;
    multiplier: number;
    unlockAt: number;
}

/** Theorem effect kinds — discriminated union, one variant per node. */
export type TheoremEffect =
    | {type: 'production_mult'; value: number}
    | {type: 'offline_cap_mult'; value: number}
    | {type: 'cost_reduction'; value: number}
    | {type: 'production_per_building'; value: number}
    | {type: 'chronicle_mult'; value: number}
    | {type: 'recall_bonus'; value: number}
    | {type: 'dispatch_mult'; value: number}
    | {type: 'concurrent_bonus_per_scientist'; value: number}
    | {type: 'library_template_mult'; value: number}
    | {type: 'many_hands_global'; threshold: number; value: number}
    | {type: 'prestige_bonus_levels'; value: number}
    | {type: 'milestone_bonus_mult'; value: number}
    | {type: 'prestige_production_bonus'; value: number}
    | {type: 'prestige_threshold_mult'; value: number};

export type TheoremBranch = 'automation' | 'quantum' | 'chaos' | 'dispatch';

export interface TheoremDef {
    id: string;
    branch: TheoremBranch;
    tier: 1 | 2 | 3 | 4;
    name: string;
    description: string;
    cost: number;
    requires: string | null;
    effect: TheoremEffect;
}

/** Lifetime-stat keys a milestone can key off. */
export type MilestoneStat =
    | 'totalRpEarned'
    | 'totalBuildings'
    | 'totalPrestiges'
    | 'totalChronicleLines'
    | 'totalDispatches'
    | 'totalCleanRecalls'
    | 'totalMissionSeconds';

export interface MilestoneDef {
    id: string;
    name: string;
    description: string;
    stat: MilestoneStat;
    threshold: number;
    bonus: number;
}

/** The full engine state — the shape persisted to grind.json. */
export interface GameState {
    // --- Resources ---
    rp: number;
    totalRpEarned: number;

    // --- Buildings (id → count) ---
    buildings: Record<BuildingId, number>;

    // --- Purchased upgrade ids ---
    upgrades: string[];

    // --- Theorem tree ---
    theoremPoints: number;
    totalTheoremsEarned: number;
    unlockedTheorems: string[];

    // --- Prestige ---
    breakthroughLevel: number;

    // --- Lifetime Mezzanine-economy stats ---
    totalChronicleLines: number;
    totalDispatches: number;
    totalCleanRecalls: number;
    totalMissionSeconds: number;
    totalBuildings: number;
    totalPrestiges: number;

    // --- Earned milestone ids ---
    milestones: string[];

    // --- Session timing ---
    lastTickTime: number;
    sessionStartTime: number;
}

/** What `checkMilestones` returns. */
export interface MilestoneCheckResult {
    newState: GameState;
    earned: MilestoneDef[];
}

/** What `applyOfflineProgress` returns. */
export interface OfflineProgressResult {
    state: GameState;
    offlineRp: number;
    offlineSeconds: number;
}

/** Tech-state read-side derived from GameState — what `getBuildingRps`
 *  consumes when applying theorem multipliers. */
export interface TechState {
    unlockedTheorems: string[];
    totalBuildings: number;
    concurrentScientists: number;
}
