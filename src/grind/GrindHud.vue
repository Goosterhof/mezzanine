<script setup lang="ts">
import {computed, ref} from 'vue';

import type {BuildingId, GrindSource, TheoremBranch} from './types';

import * as gameCore from './gameCore';
import {useGrind} from './useGrind';

type Tab = 'workbench' | 'research' | 'dossier' | 'feats';

const grind = useGrind();
const tab = ref<Tab>('workbench');

const state = computed(() => grind.gameState.value);
const concurrent = computed(() => grind.concurrentScientists.value);

const totalRps = computed(() => gameCore.getTotalRps(state.value, concurrent.value));
const breakthroughReady = computed(() => gameCore.canPrestige(state.value));
const visibleBuildings = computed(() => gameCore.getVisibleBuildings(state.value.totalRpEarned));
const visibleUpgrades = computed(() => gameCore.getVisibleUpgrades(state.value.totalRpEarned, state.value.upgrades));
const visibleTheorems = computed(() => gameCore.getVisibleTheorems(state.value.unlockedTheorems));
const lastGrant = computed(() => grind.lastGrant.value);

const sourceLabel: Record<GrindSource, string> = {
    'chronicle-line': 'Chronicle Line',
    dispatch: 'Dispatch',
    recall: 'Recall',
    'mission-duration': 'Mission Duration',
};

const branchLabel: Record<TheoremBranch, string> = {
    automation: 'Automation',
    quantum: 'Quantum',
    chaos: 'Chaos',
    dispatch: 'Dispatch',
};

function buildingCost(id: BuildingId): number {
    const def = gameCore.BUILDINGS.find((b) => b.id === id);
    if (!def) return 0;
    return gameCore.getBuildingCost(def, state.value.buildings[id], state.value.unlockedTheorems);
}

function canAffordBuilding(id: BuildingId): boolean {
    return state.value.rp >= buildingCost(id);
}

function canAffordUpgrade(cost: number): boolean {
    return state.value.rp >= cost;
}

function onBuyBuilding(id: BuildingId): void {
    grind.purchaseBuilding(id);
}

function onBuyUpgrade(id: string): void {
    grind.purchaseUpgrade(id);
}

function onBuyTheorem(id: string): void {
    grind.purchaseTheorem(id);
}

function onBreakthrough(): void {
    grind.triggerBreakthrough();
}

function setTab(t: Tab): void {
    tab.value = t;
}

const theoremsByBranch = computed(() => {
    const groups: Record<TheoremBranch, ReturnType<typeof gameCore.getVisibleTheorems>> = {
        automation: [],
        quantum: [],
        chaos: [],
        dispatch: [],
    };
    for (const t of visibleTheorems.value) {
        groups[t.branch].push(t);
    }
    return groups;
});
</script>

<template>
    <div class="grind-hud h-full flex flex-col text-mz-text" data-grind-hud>
        <div
            class="instrument-panel bg-mz-canvas border-b border-mz-edge px-5 py-3 flex items-center justify-between gap-6"
        >
            <div class="flex items-center gap-6">
                <div>
                    <div class="mz-stamp-label">Research Points</div>
                    <div class="font-display text-2xl text-mz-brass">{{ gameCore.formatNumber(state.rp) }}</div>
                </div>
                <div>
                    <div class="mz-stamp-label">Output</div>
                    <div class="font-mono text-mz-text">{{ gameCore.formatNumber(totalRps) }} RP/s</div>
                </div>
                <div>
                    <div class="mz-stamp-label">Dispatched</div>
                    <div class="font-mono text-mz-text">{{ concurrent }}</div>
                </div>
                <div v-if="lastGrant">
                    <div class="mz-stamp-label">Last Grant</div>
                    <div class="font-mono text-mz-pulse-flash text-sm">
                        +{{ gameCore.formatNumber(lastGrant.amount) }} · {{ sourceLabel[lastGrant.source] }}
                    </div>
                </div>
            </div>
            <button
                v-if="breakthroughReady"
                type="button"
                class="px-4 py-2 bg-mz-brass text-mz-surface font-display tracking-wider uppercase text-xs hover:bg-mz-brass-dim"
                data-breakthrough-lever
                @click="onBreakthrough"
            >
                Breakthrough · +{{ gameCore.getPrestigeGain(state) }} TP
            </button>
            <div v-else class="mz-stamp-label">
                Breakthrough at {{ gameCore.formatNumber(gameCore.getPrestigeThreshold(state)) }} RP earned
            </div>
        </div>

        <nav class="equipment-tabs flex border-b border-mz-edge bg-mz-rail">
            <button
                type="button"
                class="mz-tab"
                :class="{'mz-tab-active': tab === 'workbench'}"
                data-tab="workbench"
                @click="setTab('workbench')"
            >
                Workbench
            </button>
            <button
                type="button"
                class="mz-tab"
                :class="{'mz-tab-active': tab === 'research'}"
                data-tab="research"
                @click="setTab('research')"
            >
                Research
            </button>
            <button
                type="button"
                class="mz-tab"
                :class="{'mz-tab-active': tab === 'dossier'}"
                data-tab="dossier"
                @click="setTab('dossier')"
            >
                Dossier
            </button>
            <button
                type="button"
                class="mz-tab"
                :class="{'mz-tab-active': tab === 'feats'}"
                data-tab="feats"
                @click="setTab('feats')"
            >
                Feats
            </button>
        </nav>

        <div class="flex-1 overflow-y-auto p-5">
            <section v-if="tab === 'workbench'" class="grid gap-3" data-tab-panel="workbench">
                <p v-if="visibleBuildings.length === 0" class="mz-stamp-label">
                    The workbench is empty. Earn RP from your dispatched scientists to reveal the first tier.
                </p>
                <article
                    v-for="b in visibleBuildings"
                    :key="b.id"
                    class="requisition-card border border-mz-edge bg-mz-rail/40 p-3 flex items-center justify-between gap-4"
                    :data-building="b.id"
                >
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="text-2xl">{{ b.icon }}</div>
                        <div class="min-w-0">
                            <div class="font-display text-mz-text">{{ b.name }}</div>
                            <div class="text-xs text-mz-text-mute truncate">{{ b.description }}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 flex-shrink-0">
                        <div class="text-right font-mono text-xs">
                            <div class="text-mz-text">{{ state.buildings[b.id] }} owned</div>
                            <div class="text-mz-text-faint">{{ gameCore.formatNumber(buildingCost(b.id)) }} RP</div>
                        </div>
                        <button
                            type="button"
                            class="mz-button"
                            :disabled="!canAffordBuilding(b.id)"
                            @click="onBuyBuilding(b.id)"
                        >
                            Buy
                        </button>
                    </div>
                </article>
            </section>

            <section v-if="tab === 'research'" class="grid gap-3" data-tab-panel="research">
                <p v-if="visibleUpgrades.length === 0" class="mz-stamp-label">
                    No upgrades available yet. Push the economy past its first thresholds.
                </p>
                <article
                    v-for="u in visibleUpgrades"
                    :key="u.id"
                    class="border border-mz-edge bg-mz-rail/40 p-3 flex items-center justify-between gap-4"
                    :data-upgrade="u.id"
                >
                    <div class="min-w-0">
                        <div class="font-display text-mz-text">{{ u.name }}</div>
                        <div class="text-xs text-mz-text-mute">{{ u.description }}</div>
                    </div>
                    <div class="flex items-center gap-3 flex-shrink-0">
                        <span class="font-mono text-xs text-mz-text-faint">{{ gameCore.formatNumber(u.cost) }} RP</span>
                        <button
                            type="button"
                            class="mz-button"
                            :disabled="!canAffordUpgrade(u.cost)"
                            @click="onBuyUpgrade(u.id)"
                        >
                            Apply
                        </button>
                    </div>
                </article>
            </section>

            <section v-if="tab === 'dossier'" class="grid gap-3 text-sm" data-tab-panel="dossier">
                <div class="grid grid-cols-2 gap-3">
                    <div class="border border-mz-edge bg-mz-rail/40 p-3">
                        <div class="mz-stamp-label">Total RP Earned</div>
                        <div class="font-display text-mz-text text-lg">
                            {{ gameCore.formatNumber(state.totalRpEarned) }}
                        </div>
                    </div>
                    <div class="border border-mz-edge bg-mz-rail/40 p-3">
                        <div class="mz-stamp-label">Chronicle Lines</div>
                        <div class="font-display text-mz-text text-lg">
                            {{ gameCore.formatNumber(state.totalChronicleLines) }}
                        </div>
                    </div>
                    <div class="border border-mz-edge bg-mz-rail/40 p-3">
                        <div class="mz-stamp-label">Dispatches</div>
                        <div class="font-display text-mz-text text-lg">{{ state.totalDispatches }}</div>
                    </div>
                    <div class="border border-mz-edge bg-mz-rail/40 p-3">
                        <div class="mz-stamp-label">Clean Recalls</div>
                        <div class="font-display text-mz-text text-lg">{{ state.totalCleanRecalls }}</div>
                    </div>
                    <div class="border border-mz-edge bg-mz-rail/40 p-3">
                        <div class="mz-stamp-label">Mission Time</div>
                        <div class="font-display text-mz-text text-lg">
                            {{ gameCore.formatDuration(state.totalMissionSeconds) }}
                        </div>
                    </div>
                    <div class="border border-mz-edge bg-mz-rail/40 p-3">
                        <div class="mz-stamp-label">Breakthroughs</div>
                        <div class="font-display text-mz-text text-lg">{{ state.totalPrestiges }}</div>
                    </div>
                </div>

                <div class="border border-mz-edge bg-mz-rail/40 p-3">
                    <div class="mz-stamp-label mb-2">
                        Milestones Earned ({{ state.milestones.length }} / {{ gameCore.MILESTONES.length }})
                    </div>
                    <ul v-if="state.milestones.length > 0" class="grid gap-1 text-xs font-mono text-mz-text-mute">
                        <li v-for="mid in state.milestones" :key="mid">
                            {{ gameCore.MILESTONES.find((m) => m.id === mid)?.name ?? mid }}
                        </li>
                    </ul>
                    <p v-else class="text-xs text-mz-text-faint">No milestones earned yet.</p>
                </div>
            </section>

            <section v-if="tab === 'feats'" class="grid gap-4" data-tab-panel="feats">
                <div class="flex items-center justify-between">
                    <div class="mz-stamp-label">
                        Theorem Points: <span class="text-mz-brass">{{ state.theoremPoints }}</span>
                    </div>
                    <div class="text-xs text-mz-text-faint">Theorems persist across breakthroughs.</div>
                </div>
                <div
                    v-for="branchId in ['automation', 'quantum', 'chaos', 'dispatch'] as TheoremBranch[]"
                    :key="branchId"
                    :data-branch="branchId"
                >
                    <div class="mz-stamp-label mb-2">{{ branchLabel[branchId] }}</div>
                    <div class="grid gap-2">
                        <article
                            v-for="t in theoremsByBranch[branchId]"
                            :key="t.id"
                            class="border p-3 flex items-center justify-between gap-3"
                            :class="
                                state.unlockedTheorems.includes(t.id)
                                    ? 'border-mz-brass/60 bg-mz-brass/5'
                                    : 'border-mz-edge bg-mz-rail/40'
                            "
                            :data-theorem="t.id"
                        >
                            <div class="min-w-0">
                                <div class="font-display text-mz-text">{{ t.name }}</div>
                                <div class="text-xs text-mz-text-mute">{{ t.description }}</div>
                            </div>
                            <div class="flex items-center gap-3 flex-shrink-0">
                                <span class="font-mono text-xs text-mz-text-faint">{{ t.cost }} TP</span>
                                <button
                                    v-if="!state.unlockedTheorems.includes(t.id)"
                                    type="button"
                                    class="mz-button"
                                    :disabled="!gameCore.canPurchaseTheorem(state, t.id)"
                                    @click="onBuyTheorem(t.id)"
                                >
                                    Unlock
                                </button>
                                <span v-else class="text-xs text-mz-brass font-display tracking-wider uppercase"
                                    >Unlocked</span
                                >
                            </div>
                        </article>
                    </div>
                </div>
            </section>
        </div>

        <div
            v-if="grind.offlineGain.value"
            class="absolute inset-x-6 top-6 z-30 bg-mz-canvas/95 border border-mz-brass/40 px-5 py-4 text-mz-text shadow-balcony"
            data-offline-banner
        >
            <div class="mz-stamp-label text-mz-brass">Welcome back</div>
            <p class="mt-2 text-sm">
                The lab kept running. While you were away the laboratory generated
                <span class="text-mz-brass font-mono">+{{ gameCore.formatNumber(grind.offlineGain.value.rp) }} RP</span>
                over {{ gameCore.formatDuration(grind.offlineGain.value.seconds) }}.
            </p>
            <button type="button" class="mt-3 mz-button" @click="grind.dismissOfflineGain()">Acknowledge</button>
        </div>
    </div>
</template>
