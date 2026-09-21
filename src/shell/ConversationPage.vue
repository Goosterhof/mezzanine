<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import CommandBar from '../command/CommandBar.vue';
import LabFloor from '../observer/LabFloor.vue';
import {useObserver} from '../observer/useObserver';
import ColleagueBenches from '../roster/ColleagueBenches.vue';
import RecentlyRecalledStrip from '../roster/RecentlyRecalledStrip.vue';
import ScientistCanvas from '../roster/ScientistCanvas.vue';
import {useRoster} from '../roster/useRoster';
import RailingDivider from './RailingDivider.vue';
import TornPaperEdge from './TornPaperEdge.vue';

const {active = true, compactFloor = true} = defineProps<{active?: boolean; compactFloor?: boolean}>();
const labFloorRef = ref<InstanceType<typeof LabFloor> | null>(null);
const dividerRef = ref<InstanceType<typeof RailingDivider> | null>(null);
const roster = useRoster();
const observer = useObserver();
// Keep the floor available as a 64px strip; its existing expand control
// offers a temporary full view without permanently spending conversation space.

// --- The plumb-line (#00057 §4) ------------------------------------------
// plumbX is the selected sprite's station x, CSS-scale-corrected and
// expressed relative to the RailingDivider's left edge. It re-targets on
// every selection change, on window resize, on railing scroll (the
// release-point visuals stay honest), and when the selected scientist's
// activity changes — the sprite WALKS to a new station and the line
// follows. It is never pinned to a selection-time x (§11).
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
// out: the pencil plumb-line drops at the figure's station, the
// construction ghosts appear under the selected figure (LabScene →
// setSelected), the light re-centers, and the terminal rises
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

// The selected scientist walks — their activity changes retarget the
// sprite's station, and the plumb-line follows (§11).
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

// The strip re-projects every station — recompute against the new geometry.
watch(
    () => compactFloor,
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
        <LabFloor ref="labFloorRef" :collapsed="compactFloor" :active="active" />
    </section>
</template>
