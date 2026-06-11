<script setup lang="ts">
// RailingNameplates — the roster rotated horizontal and mounted ON the
// railing (#00057). Replaces the bench-inherited sidebar `Roster.vue`.
//
// Three-tier overflow rule (the railing-width law):
//   1. Fits (≤ VISIBLE_CAP plates): all plates render full-width, packed
//      left; the rail scrolls horizontally if the window is narrow.
//   2. Overflows: horizontal scroll with a brass fade mask at the right
//      edge; the selected plate always scrolls into view (inline).
//   3. Heavy overflow (> VISIBLE_CAP plates): plates condense (mission
//      line drops) and surplus plates fold into a `‹ N more ›` drawer —
//      a vertical popover reusing `ScientistRow.vue` verbatim.
//
// Two overflow laws keep the signature gesture total:
//   SELECTION PROMOTES — selecting a scientist whose plate is folded
//   into the drawer pulls the plate onto the visible rail, swapping
//   with the least-recently-selected visible plate. The plumb-anchor
//   always exists.
//   CRASH PINS — a crashed plate is exempt from overflow. The scientist
//   most in need of notice is never the one allowed to hide.

import {computed, ref, watch} from 'vue';

import type {Scientist, ScientistId} from '../roster/types';

import RecentlyRecalledStrip from '../roster/RecentlyRecalledStrip.vue';
import ScientistRow from '../roster/ScientistRow.vue';
import {useRoster} from '../roster/useRoster';
import RailingNameplate from './RailingNameplate.vue';

/** The hard cap of plates the rail wears before surplus folds into the
 *  drawer. The wireframe's "more than ~6 plates" heavy-overflow tier,
 *  made mechanical. */
const VISIBLE_CAP = 6;

const roster = useRoster();
const railRef = ref<HTMLElement | null>(null);
const drawerOpen = ref(false);

// Selection recency — drives the "swap with the least-recently-selected
// visible plate" promotion law. A monotonic sequence beats wall-clock
// time here: deterministic under test, immune to clock skew.
let selectionSeq = 0;
const lastSelectedSeq = ref<Map<ScientistId, number>>(new Map());

watch(
    () => roster.selected.value,
    (id) => {
        if (id !== null) {
            const next = new Map(lastSelectedSeq.value);
            next.set(id, ++selectionSeq);
            lastSelectedSeq.value = next;
        }
        // Any selection settles the rail — the drawer's job is done the
        // moment a choice lands (a promoted plate is now on the rail).
        drawerOpen.value = false;
    },
);

const sortedScientists = computed(() =>
    [...roster.scientists.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
);

const condensed = computed(() => sortedScientists.value.length > VISIBLE_CAP);

/** Rail priority — who earns a visible plate when the rail overflows.
 *  Crashed plates pin (law 2), the selected plate promotes (law 1),
 *  then selection recency, then dispatch recency. */
function railPriority(s: Scientist): [number, number, number, number] {
    return [
        s.state === 'crashed' ? 1 : 0,
        roster.selected.value === s.id ? 1 : 0,
        lastSelectedSeq.value.get(s.id) ?? 0,
        Date.parse(s.startedAt) || 0,
    ];
}

function compareRailPriority(a: Scientist, b: Scientist): number {
    const pa = railPriority(a);
    const pb = railPriority(b);
    for (let i = 0; i < pa.length; i++) {
        const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

const visiblePlates = computed<Scientist[]>(() => {
    const sorted = sortedScientists.value;
    if (sorted.length <= VISIBLE_CAP) {
        return sorted;
    }
    const ranked = [...sorted].sort(compareRailPriority);
    // Crashed plates never fold — the cap stretches rather than hide one.
    const crashedCount = sorted.filter((s) => s.state === 'crashed').length;
    const cap = Math.max(VISIBLE_CAP, crashedCount);
    const visibleIds = new Set(ranked.slice(0, cap).map((s) => s.id));
    // Display in stable dispatch order, not priority order — plates do
    // not reshuffle on every selection, they only swap in and out.
    return sorted.filter((s) => visibleIds.has(s.id));
});

const overflowPlates = computed<Scientist[]>(() => {
    const visibleIds = new Set(visiblePlates.value.map((s) => s.id));
    return sortedScientists.value.filter((s) => !visibleIds.has(s.id));
});

const overflowCount = computed(() => overflowPlates.value.length);
const hasRecalledStrip = computed(() => roster.recalledStrip.value.length > 0);

function toggleDrawer(): void {
    drawerOpen.value = !drawerOpen.value;
}

// Carried from Roster.vue's scrollToRow — the geometry change is the
// axis: the rail scrolls horizontally, so the selected plate slides
// into view with `inline: 'nearest'`.
function scrollToPlate(id: ScientistId): void {
    if (!railRef.value) return;
    const plate = railRef.value.querySelector<HTMLElement>(`[data-scientist-id="${id}"]`);
    if (plate) {
        plate.scrollIntoView({behavior: 'smooth', inline: 'nearest', block: 'nearest'});
    }
}

defineExpose({scrollToPlate, railRef});
</script>

<template>
    <nav
        class="relative flex-shrink-0 flex items-stretch bg-mz-rail border-b border-mz-edge-soft"
        data-railing
        aria-label="Dispatched scientists"
    >
        <div
            ref="railRef"
            class="flex-1 flex items-stretch gap-px overflow-x-auto min-w-0"
            style="mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent)"
            data-railing-rail
        >
            <!-- Empty rail = bare railing; the floor below carries the empty-state voice -->
            <RailingNameplate v-for="s in visiblePlates" :key="s.id" :scientist="s" :condensed="condensed" />
        </div>

        <!-- Heavy-overflow drawer — the old Roster list, summoned on demand -->
        <div v-if="overflowCount > 0" class="relative flex-shrink-0 flex items-center px-1">
            <button type="button" class="mz-button" data-railing-more @click="toggleDrawer">
                ‹ {{ overflowCount }} more ›
            </button>
            <div
                v-if="drawerOpen"
                class="absolute right-0 top-full z-30 w-80 max-h-96 overflow-y-auto bg-mz-panel border border-mz-edge shadow-balcony"
                data-railing-drawer
            >
                <ScientistRow v-for="s in overflowPlates" :key="s.id" :scientist="s" />
            </div>
        </div>

        <!-- Recently Recalled — plates slid off the rail and set aside, docked right -->
        <RecentlyRecalledStrip v-if="hasRecalledStrip" data-recalled-strip />
    </nav>
</template>
