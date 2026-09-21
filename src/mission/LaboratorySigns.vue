<script setup lang="ts">
import {computed} from 'vue';

import BalconySign from '../balcony/BalconySign.vue';
import {useBalconySigns} from '../balcony/useBalconySigns';
const balconySigns = useBalconySigns();
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
    <div class="flex flex-wrap gap-3 px-5 py-4 border-b border-mz-edge">
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
    </div>
</template>
