<script setup lang="ts">
import {computed} from 'vue';

import BalconySign from '../balcony/BalconySign.vue';
import {useBalconySigns} from '../balcony/useBalconySigns';
import {useDispatch} from '../balcony/useDispatch';

const dispatch = useDispatch();
const balconySigns = useBalconySigns();

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
        class="h-14 flex-shrink-0 border-b border-mz-edge bg-mz-rail flex items-center justify-between px-6"
        data-balcony-rail
    >
        <div class="flex items-center gap-6">
            <div>
                <div class="mz-stamp-label">The Mezzanine</div>
                <div class="font-display text-mz-text text-sm tracking-wide">Balcony overlooking the lab floor</div>
            </div>
        </div>
        <div class="flex items-center gap-2">
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
            <BalconySign label="Reserved" value="More signs coming." placeholder />
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
