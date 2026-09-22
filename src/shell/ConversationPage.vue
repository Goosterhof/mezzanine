<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import CommandBar from '../command/CommandBar.vue';
import LabFloor from '../observer/LabFloor.vue';
import {SHORT_WINDOW_H} from '../observer/projection';
import {useObserver} from '../observer/useObserver';
import ColleagueBenches from '../roster/ColleagueBenches.vue';
import RecentlyRecalledStrip from '../roster/RecentlyRecalledStrip.vue';
import ScientistCanvas from '../roster/ScientistCanvas.vue';
import {useRoster} from '../roster/useRoster';
import RailingDivider from './RailingDivider.vue';
import TornPaperEdge from './TornPaperEdge.vue';

const {active = true, compactFloor = false} = defineProps<{active?: boolean; compactFloor?: boolean}>();
const labFloorRef = ref<InstanceType<typeof LabFloor> | null>(null);
const dividerRef = ref<InstanceType<typeof RailingDivider> | null>(null);
const roster = useRoster();
const observer = useObserver();

// The Long Bench (#00041 §5, ruled 2026-09-22) defaults EXPANDED: a 64px
// default answered the investor's "lively" with a sliver. The ⌃ control on
// the band flips this choice to the 64px crop of the same drawing when
// terminal height matters; a short window forces the crop regardless.
const floorCompact = ref(compactFloor);
watch(
    () => compactFloor,
    (next) => {
        floorCompact.value = next;
    },
);
const shortWindow = ref(window.innerHeight < SHORT_WINDOW_H);

// --- The plumb-line (#00057 §4) ------------------------------------------
// plumbX is the selected figure's CURRENT x, expressed relative to the
// RailingDivider's left edge. It re-reads on every selection change, on
// window resize, on a posture change, and on every frame the selected
// figure moves (the band's `placed` event) — so while a colleague walks,
// the line walks with them. It lands on the figure, never on where the
// figure is going (#00041 §2.3 D4, trip-wire 8).
const plumbX = ref<number | null>(null);
const plumbLength = ref(160);
const plumbDropping = ref(false);
let plumbDropTimer: ReturnType<typeof setTimeout> | null = null;

function dividerOrigin(): {left: number; top: number} {
    const dividerEl = dividerRef.value?.$el as HTMLElement | undefined;
    const rect = dividerEl?.getBoundingClientRect();
    return {left: rect?.left ?? 0, top: rect?.top ?? 0};
}

function recomputePlumb(): void {
    if (!active) return;
    const id = roster.selected.value;
    const point = id === null ? null : (labFloorRef.value?.stationToPage(id) ?? null);
    if (!point) {
        plumbX.value = null;
        return;
    }
    const origin = dividerOrigin();
    plumbX.value = point.x - origin.left;
    plumbLength.value = Math.max(16, point.y - origin.top);
}

function dropPlumb(): void {
    if (plumbDropTimer !== null) {
        clearTimeout(plumbDropTimer);
    }
    plumbDropping.value = true;
    plumbDropTimer = setTimeout(() => {
        plumbDropping.value = false;
        plumbDropTimer = null;
    }, 320);
}

// The Recently Recalled strip lost its dock when the railing plates
// retired (#00059 J-3 — it sat at the rail's right end inside the
// plate rail). The 5-minute TTL ledger survives; it docks directly
// under the Balustrade now, and only while it has entries.
const hasRecalledStrip = computed(() => roster.recalledStrip.value.length > 0);

function onWindowResize(): void {
    shortWindow.value = window.innerHeight < SHORT_WINDOW_H;
    recomputePlumb();
}

onMounted(() => window.addEventListener('resize', onWindowResize));
onBeforeUnmount(() => {
    window.removeEventListener('resize', onWindowResize);
    if (plumbDropTimer) clearTimeout(plumbDropTimer);
});
// Selection → the signature gesture (#00057 §4, reframed by #00059 §4:
// "The Figure Under Study"). Figure clicks and caption clicks on the
// page land in `useRoster.selected`; this watcher fans the selection
// out: the pencil plumb-line drops on the figure, the construction
// ghosts appear on the selected figure (LabScene → setSelected), its
// wash lifts on the bench, and the terminal rises
// (ScientistCanvas). On select(null) the gesture unwinds without
// ceremony — the railing simply lets go. (The plate-scroll duty retired
// with the DOM nameplates in #00059 J-3.)
watch(
    () => roster.selected.value,
    (id) => {
        void nextTick(() => {
            recomputePlumb();
            if (id !== null) {
                dropPlumb();
            }
        });
    },
);

// The selected colleague's activity changes where they are going; the
// band's `placed` event then carries the line along the walk itself.
watch(
    () => {
        const id = roster.selected.value;
        return id === null ? null : observer.activities.value.get(id)?.state;
    },
    () => {
        void nextTick(() => {
            recomputePlumb();
        });
    },
);

// The posture re-cuts the band — recompute against the new geometry.
watch(
    () => [floorCompact.value, shortWindow.value],
    () => {
        void nextTick(() => {
            recomputePlumb();
        });
    },
);

watch(
    () => active,
    (visible) => {
        if (visible) void nextTick(recomputePlumb);
    },
);
</script>
<template>
    <section class="flex flex-col h-full min-h-0 min-w-0" aria-label="Conversation" data-page="conversation">
        <ColleagueBenches />
        <RecentlyRecalledStrip v-if="hasRecalledStrip" />
        <ScientistCanvas :active="active" />
        <CommandBar />
        <RailingDivider ref="dividerRef" :selected-x="plumbX" :drop-length="plumbLength" :dropping="plumbDropping" />
        <TornPaperEdge />
        <LabFloor
            ref="labFloorRef"
            v-model:collapsed="floorCompact"
            :forced="shortWindow"
            :active="active"
            @placed="recomputePlumb"
        />
    </section>
</template>
