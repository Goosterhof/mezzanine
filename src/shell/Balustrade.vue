<script setup lang="ts">
// Balustrade — the single brass cap of the two-storey frame (#00057).
//
// The Overlook's first structural truth: a mezzanine has ONE top edge.
// The bench-inherited stack of BalconyRail (h-14) + TopBar (h-11) read
// as "navbar + tab bar" — pure IDE chrome. This component merges them
// into one ~76px balustrade: identity, the two brass signs, the four
// surviving panel glyphs, and the Dispatch trigger, all on one rail.
//
// The "Reserved" placeholder sign is retired — the merged rail is
// denser; a placeholder tile is dead weight. The OB glyph is retired
// with it: the Observer floor is permanent now (LabFloor), and a toggle
// for an always-on surface is a contradiction.

import {computed} from 'vue';

import BalconySign from '../balcony/BalconySign.vue';
import {useBalconySigns} from '../balcony/useBalconySigns';
import {useDispatch} from '../balcony/useDispatch';
import {useShell, type PanelId} from './useShell';

const shell = useShell();
const dispatch = useDispatch();
const balconySigns = useBalconySigns();

// The four surviving summonable panels. The Observer is deliberately
// absent — the floor below is not summoned, it is simply there.
const panelButtons: Array<{id: PanelId; label: string; glyph: string}> = [
    {id: 'mission-control', label: 'Mission Control', glyph: 'MC'},
    {id: 'drydock', label: 'Drydock', glyph: 'DD'},
    {id: 'holotable', label: 'Holotable', glyph: 'HT'},
    {id: 'grind', label: 'Grind', glyph: 'GR'},
];

function toggleDispatch(): void {
    dispatch.toggle();
}

function onRefresh(): void {
    void balconySigns.refresh();
}

const lastChaosValue = computed<string>(() => {
    const sign = balconySigns.signs.value.lastChaos;
    if (sign.reportNumber !== null) {
        return `#${String(sign.reportNumber).padStart(5, '0')}`;
    }
    if (sign.raw) {
        return sign.raw;
    }
    return 'No chaos report yet';
});

const lastChaosSub = computed<string | null>(() => {
    const sign = balconySigns.signs.value.lastChaos;
    if (sign.reportNumber === null && !sign.raw) {
        return null;
    }
    const parts: string[] = [];
    if (sign.label) {
        parts.push(sign.label);
    }
    if (sign.score) {
        parts.push(sign.score);
    }
    return parts.length === 0 ? null : parts.join(' · ');
});

const ideaLedgerValue = computed<string>(() => {
    const sign = balconySigns.signs.value.ideaLedger;
    return `${sign.candidateCount} CAND · ${sign.shelvedCount} SHELVED`;
});

const ideaLedgerSub = computed<string | null>(() => {
    const date = balconySigns.signs.value.ideaLedger.mostRecentDelivered;
    return date ? `Last DELIVERED ${date}` : null;
});
</script>

<template>
    <header
        class="flex-shrink-0 flex items-center justify-between gap-6 px-6 border-b border-mz-edge bg-mz-rail"
        style="min-height: 76px"
        data-balustrade
    >
        <!-- Identity — the engraved plate at the left end of the cap -->
        <div class="flex items-center gap-3 min-w-0">
            <span class="text-mz-brass font-display text-sm tracking-[0.25em] uppercase flex-shrink-0">⌬</span>
            <div class="min-w-0">
                <div class="mz-stamp-label">The Mezzanine</div>
                <h1 class="font-display text-mz-text text-sm tracking-wide truncate font-normal my-0">
                    Balcony overlooking the lab floor
                </h1>
            </div>
        </div>

        <div class="flex items-center gap-2">
            <!-- The two brass signs — the Reserved placeholder is retired -->
            <BalconySign
                label="Last Chaos"
                :value="lastChaosValue"
                :sub="lastChaosSub"
                refreshable
                :refreshing="balconySigns.loading.value"
                @refresh="onRefresh"
            />
            <BalconySign
                label="Idea Ledger"
                :value="ideaLedgerValue"
                :sub="ideaLedgerSub"
                refreshable
                :refreshing="balconySigns.loading.value"
                @refresh="onRefresh"
            />

            <!-- Panel glyphs — four survive; OB is retired with the permanent floor -->
            <button
                v-for="btn in panelButtons"
                :key="btn.id"
                type="button"
                class="mz-button"
                :class="{'border-mz-brass text-mz-brass': shell.openPanel.value === btn.id}"
                :title="btn.label"
                @click="shell.togglePanel(btn.id)"
            >
                {{ btn.glyph }}
            </button>

            <!-- Dispatch — the one warm call-to-action on the cap -->
            <button
                type="button"
                class="mz-button border-mz-brass text-mz-text px-4 py-2 ml-2"
                data-dispatch-trigger
                @click="toggleDispatch"
            >
                Dispatch ▾
            </button>
        </div>
    </header>
</template>
