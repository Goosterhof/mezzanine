// useGrind — singleton composable for the Grind's game loop.
//
// Owns:
//   * the reactive `gameState` — single source of truth for the panel
//   * the 1-second tick (passive building output)
//   * the 30-second auto-save (Tauri IPC)
//   * the `grind-rp-grant` Tauri listener
//   * the lifetime grant tally — exposed to the HUD for the last-grant
//     readout
//
// The composable is push-always: the Tauri listener subscribes on the
// first mount and keeps consuming grants even while the panel is closed.
// Closing the panel pauses the renderer's RAF but the economy keeps
// ticking — the laboratory never stops earning.

import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {computed, ref} from 'vue';

import type {BuildingId, GameState, RpGrant} from './types';

import {useRoster} from '../roster/useRoster';
import * as gameCore from './gameCore';

const AUTOSAVE_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 1000;

const gameState = ref<GameState>(gameCore.createGameState());
const lastGrant = ref<RpGrant | null>(null);
const isHydrated = ref(false);
const offlineGain = ref<{rp: number; seconds: number} | null>(null);

let tickHandle: ReturnType<typeof setInterval> | null = null;
let autosaveHandle: ReturnType<typeof setInterval> | null = null;
let unlistenGrant: UnlistenFn | null = null;
let subscribePromise: Promise<void> | null = null;

function concurrentScientistCount(): number {
    return useRoster().scientists.value.length;
}

function applyTickInternal(): void {
    const concurrent = concurrentScientistCount();
    const next = gameCore.tick(gameState.value, TICK_INTERVAL_MS / 1000, concurrent);
    const checked = gameCore.checkMilestones(next);
    gameState.value = checked.newState;
}

function applyGrantInternal(grant: RpGrant): void {
    lastGrant.value = grant;
    const next = gameCore.applyGrant(gameState.value, grant);
    const checked = gameCore.checkMilestones(next);
    gameState.value = checked.newState;
}

async function persist(): Promise<void> {
    try {
        await invoke('save_grind_state', {gameState: gameState.value});
    } catch (err) {
        // The lab keeps running even if the snapshot write fails — the
        // economy is in-memory while the gadget is up. The next tick will
        // retry. Logged so the investor sees a pattern if disk is full.
        // eslint-disable-next-line no-console
        console.warn('The Grind could not persist its game state:', err);
    }
}

async function hydrateFromDisk(): Promise<void> {
    try {
        const loaded = await invoke<unknown>('load_grind_state');
        if (loaded && typeof loaded === 'object') {
            gameState.value = loaded as GameState;
        }
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('The Grind could not load saved state:', err);
    }
    isHydrated.value = true;
}

function applyOfflineCatchup(): void {
    const offline = gameCore.applyOfflineProgress(gameState.value, concurrentScientistCount());
    if (offline.offlineRp > 0) {
        offlineGain.value = {rp: offline.offlineRp, seconds: offline.offlineSeconds};
        gameState.value = offline.state;
    }
}

async function bootSequence(): Promise<void> {
    await hydrateFromDisk();
    applyOfflineCatchup();
    unlistenGrant = await listen<RpGrant>('grind-rp-grant', (event) => {
        applyGrantInternal(event.payload);
    });
    tickHandle = setInterval(applyTickInternal, TICK_INTERVAL_MS);
    autosaveHandle = setInterval(() => {
        void persist();
    }, AUTOSAVE_INTERVAL_MS);
}

function tearDownInternal(): void {
    if (unlistenGrant) {
        unlistenGrant();
        unlistenGrant = null;
    }
    if (tickHandle !== null) {
        clearInterval(tickHandle);
        tickHandle = null;
    }
    if (autosaveHandle !== null) {
        clearInterval(autosaveHandle);
        autosaveHandle = null;
    }
    subscribePromise = null;
}

export function useGrind() {
    return {
        gameState: computed(() => gameState.value),
        lastGrant: computed(() => lastGrant.value),
        isHydrated: computed(() => isHydrated.value),
        offlineGain: computed(() => offlineGain.value),
        concurrentScientists: computed(concurrentScientistCount),

        /** Hydrate from disk, subscribe to grants, start the tick + autosave.
         *  Idempotent — second call awaits the first promise. */
        async start(): Promise<void> {
            if (subscribePromise) {
                return subscribePromise;
            }
            subscribePromise = bootSequence();
            return subscribePromise;
        },

        async save(): Promise<void> {
            await persist();
        },

        purchaseBuilding(buildingId: BuildingId): void {
            const next = gameCore.purchaseBuilding(gameState.value, buildingId);
            if (next) {
                gameState.value = gameCore.checkMilestones(next).newState;
            }
        },

        purchaseUpgrade(upgradeId: string): void {
            const next = gameCore.purchaseUpgrade(gameState.value, upgradeId);
            if (next) {
                gameState.value = next;
            }
        },

        purchaseTheorem(theoremId: string): void {
            const next = gameCore.purchaseTheorem(gameState.value, theoremId);
            if (next) {
                gameState.value = next;
            }
        },

        triggerBreakthrough(): boolean {
            const next = gameCore.prestige(gameState.value);
            if (!next) return false;
            gameState.value = next;
            return true;
        },

        dismissOfflineGain(): void {
            offlineGain.value = null;
        },

        teardown(): void {
            tearDownInternal();
        },

        reset(): void {
            tearDownInternal();
            gameState.value = gameCore.createGameState();
            lastGrant.value = null;
            isHydrated.value = false;
            offlineGain.value = null;
        },

        _injectGrantForTests(grant: RpGrant): void {
            applyGrantInternal(grant);
        },

        _tickForTests(): void {
            applyTickInternal();
        },
    };
}
