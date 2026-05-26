// useHolotable — singleton state + IPC for the lab floor.
//
// The Vue side is read-on-open: every `togglePanel('holotable')` opening
// fires `refresh()`, and the chrome's refresh button fires it on demand.
// No polling, no file watcher. The dispatched-model voice carries: the
// investor pulls intelligence, the floor does not push it.
//
// The composable also exposes `legacyState`, an adapter that flattens the
// typed Rust `DashboardState` into the `{structures, branch, timestamp}`
// shape the lifted WebGL engine expects. Keeping the engine intact is
// the whole point of the lift — the adapter is the only seam where the
// new shape touches the old.

import {invoke} from '@tauri-apps/api/core';
import {computed, ref} from 'vue';

import type {
    DashboardState,
    ExperimentNode,
    GadgetNode,
    HealthState,
    HolotableError,
    InfraNode,
    TowerNode,
} from './types';

import {EMPTY_DASHBOARD} from './types';

interface LegacyStructure {
    id: string;
    label: string;
    type: 'tower' | 'experiment' | 'gadget' | 'database' | 'pipeline';
    health: HealthState;
    detail: string;
    meta: Record<string, string | number | boolean>;
}

interface LegacyState {
    structures: LegacyStructure[];
    branch: string;
    branchHealth: HealthState;
    timestamp: number;
}

const dashboardState = ref<DashboardState>({...EMPTY_DASHBOARD});
const isLoading = ref(false);
const lastError = ref<HolotableError>(null);
const lastRefreshedAt = ref<string | null>(null);

const legacyState = computed<LegacyState>(() => buildLegacyState(dashboardState.value));

export function useHolotable() {
    return {
        dashboardState,
        legacyState,
        isLoading,
        lastError,
        lastRefreshedAt,

        /**
         * Read the floor's state through the Tauri bridge. On error the
         * variant is classified so the panel can render the right copy.
         */
        async refresh(): Promise<void> {
            isLoading.value = true;
            lastError.value = null;
            try {
                const payload = await invoke<DashboardState>('read_holotable_state');
                dashboardState.value = payload;
                lastRefreshedAt.value = new Date().toISOString();
            } catch (error) {
                lastError.value = classifyError(error);
            } finally {
                isLoading.value = false;
            }
        },

        reset(): void {
            dashboardState.value = {...EMPTY_DASHBOARD};
            isLoading.value = false;
            lastError.value = null;
            lastRefreshedAt.value = null;
        },
    };
}

/** Classify a Tauri invoke rejection into one of the three operational variants. */
export function classifyError(raw: unknown): HolotableError {
    const message = raw instanceof Error ? raw.message : String(raw);
    // The Rust side renders `MezzanineError::ConfigCorrupt` as the literal
    // string "config corrupted — first-run wizard required" (see error.rs).
    // We match on the canonical phrase so the variant is stable when the
    // operator message moves.
    if (
        message.toLowerCase().includes('first-run wizard required') ||
        message.toLowerCase().includes('config corrupted')
    ) {
        return {kind: 'pre-wizard', message};
    }
    return {kind: 'bridge-failure', message};
}

/**
 * Flatten the typed DashboardState into the legacy structure-array shape
 * the lifted WebGL engine expects. The engine reads `structures`,
 * `branch`, and `timestamp` — nothing else. Keeping this adapter on the
 * frontend keeps the Rust shape clean for tests and for future surfaces.
 */
export function buildLegacyState(state: DashboardState): LegacyState {
    const structures: LegacyStructure[] = [];
    structures.push(fromTower(state.tower));
    for (const exp of state.experiments) {
        structures.push(fromExperiment(exp));
    }
    for (const gad of state.gadgets) {
        structures.push(fromGadget(gad));
    }
    structures.push(fromInfra(state.database));
    structures.push(fromInfra(state.pipeline));
    const branchHealth: HealthState = state.tower.health;
    return {
        structures,
        branch: state.branch || 'unknown',
        branchHealth,
        timestamp: state.timestamp ? Date.parse(state.timestamp) || Date.now() : Date.now(),
    };
}

function fromTower(node: TowerNode): LegacyStructure {
    return {
        id: node.id,
        label: node.label,
        type: 'tower',
        health: node.health,
        detail: node.detail,
        meta: {
            branch: node.branch,
            dirty: node.dirty,
            modified: node.modifiedCount,
            staged: node.stagedCount,
            untracked: node.untrackedCount,
        },
    };
}

function fromExperiment(node: ExperimentNode): LegacyStructure {
    return {
        id: node.id,
        label: node.label,
        type: 'experiment',
        health: node.health,
        detail: node.detail,
        meta: {slug: node.slug, url: node.url, gitStatus: node.gitStatus, responseTime: node.responseTimeMs},
    };
}

function fromGadget(node: GadgetNode): LegacyStructure {
    return {
        id: node.id,
        label: node.label,
        type: 'gadget',
        health: node.health,
        detail: node.detail,
        meta: {gitStatus: node.gitStatus, self: node.isSelf},
    };
}

function fromInfra(node: InfraNode): LegacyStructure {
    return {
        id: node.id,
        label: node.label,
        type: node.kind === 'database' ? 'database' : 'pipeline',
        health: node.health,
        detail: node.detail,
        meta: {},
    };
}
