// Holotable types — mirror `src-tauri/src/holotable/*` serde shapes.
//
// Keep these in lockstep with the Rust side. When a struct field renames
// or moves in `aggregator.rs`, the matching field here must follow.
// Tests assert on field names so drift surfaces fast.

export type HealthState = 'green' | 'amber' | 'red' | 'unknown';
export type NodeKind = 'tower' | 'experiment' | 'gadget' | 'database' | 'pipeline';

export interface TowerNode {
    id: string;
    label: string;
    kind: NodeKind;
    health: HealthState;
    branch: string;
    dirty: boolean;
    modifiedCount: number;
    stagedCount: number;
    untrackedCount: number;
    detail: string;
}

export interface ExperimentNode {
    id: string;
    label: string;
    slug: string;
    kind: NodeKind;
    health: HealthState;
    url: string;
    gitStatus: string;
    detail: string;
    responseTimeMs: number;
}

export interface GadgetNode {
    id: string;
    label: string;
    kind: NodeKind;
    health: HealthState;
    gitStatus: string;
    detail: string;
    isSelf: boolean;
}

export interface InfraNode {
    id: string;
    label: string;
    kind: NodeKind;
    health: HealthState;
    detail: string;
}

export interface DashboardState {
    tower: TowerNode;
    experiments: ExperimentNode[];
    gadgets: GadgetNode[];
    database: InfraNode;
    pipeline: InfraNode;
    branch: string;
    dirty: boolean;
    timestamp: string;
}

// HolotableError — the three operational variants the panel distinguishes.
// `null` means the call succeeded. `pre-wizard` means the wizard hasn't
// completed yet (the Rust side returned ConfigCorrupt — `lab_root` is None).
// `bridge-failure` means the WSL2 bridge or subprocess machinery failed.
export type HolotableError = null | {kind: 'pre-wizard' | 'bridge-failure'; message: string};

export const EMPTY_TOWER: TowerNode = {
    id: 'tower',
    label: 'Zmuuzn',
    kind: 'tower',
    health: 'unknown',
    branch: '',
    dirty: false,
    modifiedCount: 0,
    stagedCount: 0,
    untrackedCount: 0,
    detail: '',
};

export const EMPTY_DASHBOARD: DashboardState = {
    tower: EMPTY_TOWER,
    experiments: [],
    gadgets: [],
    database: {id: 'database', label: 'PostgreSQL', kind: 'database', health: 'unknown', detail: ''},
    pipeline: {id: 'pipeline', label: 'Railway', kind: 'pipeline', health: 'unknown', detail: ''},
    branch: '',
    dirty: false,
    timestamp: '',
};
