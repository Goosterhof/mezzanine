<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue';

import AscentPrompt from './ascent/AscentPrompt.vue';
import {useAscent} from './ascent/useAscent';
import Dispatch from './balcony/Dispatch.vue';
import {useBalconySigns} from './balcony/useBalconySigns';
import {useBriefingLibrary} from './balcony/useBriefingLibrary';
import CommandBar from './command/CommandBar.vue';
import DrydockPanel from './drydock/DrydockPanel.vue';
import GrindPanel from './grind/GrindPanel.vue';
import {useGrind} from './grind/useGrind';
import HolotablePanel from './holotable/HolotablePanel.vue';
import MissionControl from './mission/MissionControl.vue';
import LabFloor from './observer/LabFloor.vue';
import {useObserver} from './observer/useObserver';
import RecentlyRecalledStrip from './roster/RecentlyRecalledStrip.vue';
import ScientistCanvas from './roster/ScientistCanvas.vue';
import {useRoster} from './roster/useRoster';
import {useRosterBackend} from './roster/useRosterBackend';
import Balustrade from './shell/Balustrade.vue';
import RailingDivider from './shell/RailingDivider.vue';
import TornPaperEdge from './shell/TornPaperEdge.vue';
import FirstRunWizard from './wizard/FirstRunWizard.vue';
import {useWizard} from './wizard/useWizard';

const labFloorRef = ref<InstanceType<typeof LabFloor> | null>(null);
const dividerRef = ref<InstanceType<typeof RailingDivider> | null>(null);
const roster = useRoster();
const observer = useObserver();
const wizard = useWizard();

// The Ascent (#00056) — fire the boot update-check exactly once, and only
// after the first-run wizard has cleared. A brand-new install configures
// itself (lab root, claude binary, chronicle ack) before the balcony reaches
// outward to the floor below for the first time (§7 — first reach outward).
let ascentChecked = false;

// The Overlook (#00057) — short-window collapse. Below 820px of window
// height the floor surrenders its storey to the terminal and becomes a
// 64px strip (§10 divergence #1: tauri.conf.json minimums stay 1080×720;
// the strip earns its keep in the 720–819px band). Height is the only
// collapse trigger — the width branch is unreachable behind minWidth.
const SHORT_WINDOW_THRESHOLD = 820;
const isShortWindow = ref(window.innerHeight < SHORT_WINDOW_THRESHOLD);

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
    isShortWindow.value = window.innerHeight < SHORT_WINDOW_THRESHOLD;
    recomputePlumb();
}

onMounted(() => {
    window.addEventListener('resize', onWindowResize);
    void useRosterBackend().subscribe();
    // The wizard's step 3 folds in the chronicle ack — on first boot the
    // disclosure is acknowledged when the investor opens the balcony.
    void useWizard().loadStatus();
    // Balcony state — load the rail's signs and the briefing library on boot.
    void useBalconySigns().refresh();
    void useBriefingLibrary().load();
    // Arc 2 (#00052) — subscribe to the chronicle-event channel. The
    // subscription is push-always: events fan into the Observer's
    // per-scientist activity map even while the Observer panel is
    // collapsed, so the sprites reflect the right state the moment the
    // floor opens.
    void observer.subscribe();
    // Arc 3 (#00053) — start the Grind's economy loop. Push-always: the
    // lab earns from every chronicle line, dispatch, and clean recall
    // regardless of whether the panel is open. The renderer's RAF
    // pauses when the panel closes; the economy never does.
    void useGrind().start();
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
watch(isShortWindow, () => {
    void nextTick(() => {
        recomputePlumb();
    });
});

// The Ascent boot check — gated on wizard completion. `needsWalkthrough` is
// true while the wizard is checked-and-incomplete; it flips false once the
// investor opens the balcony (or on boot for a returning investor). Fire the
// silent boot check the first time the balcony is confirmed configured.
watch(
    () => wizard.isReady() && !wizard.needsWalkthrough.value,
    (cleared) => {
        if (cleared && !ascentChecked) {
            ascentChecked = true;
            void useAscent().check();
        }
    },
    {immediate: true},
);
</script>

<template>
    <div class="relative flex flex-col h-full bg-mz-surface text-mz-text font-body">
        <!-- ① + ② : the balcony chrome — one merged brass cap. The DOM
             nameplate railing retired in #00059 J-3: the roster lives
             only on the page below now. The Recently Recalled ledger
             survives, docked under the cap while it has entries. -->
        <Balustrade />
        <RecentlyRecalledStrip v-if="hasRecalledStrip" />
        <!-- ④ + ⑤ : the investor's storey -->
        <main class="relative flex-1 flex flex-col min-h-0 min-w-0">
            <ScientistCanvas />
            <CommandBar />
        </main>
        <!-- ⑥ : the edge you lean over — hosts the pencil plumb-line -->
        <RailingDivider ref="dividerRef" :selected-x="plumbX" :drop-length="plumbLength" :dropping="plumbDropping" />
        <!-- The torn paper seam (#00059 J-4): the brass railing holds the
             page, the paper tears away below it. Stacking note: the
             plumb-line (z-10, in RailingDivider) renders ABOVE this edge
             (z-[5]) — the pencil line hangs over the page. -->
        <TornPaperEdge />
        <!-- ⑦ : the floor below — ALWAYS present, never a toggle. No v-if,
             no v-show: if this mount can disappear, the redesign has not
             happened (#00057 §3). -->
        <LabFloor ref="labFloorRef" :collapsed="isShortWindow" />
        <!-- Summonable panels — four survive; the Observer is RETIRED (the floor is permanent) -->
        <Dispatch />
        <MissionControl />
        <DrydockPanel />
        <HolotablePanel />
        <GrindPanel />
        <FirstRunWizard />
        <AscentPrompt />
    </div>
</template>
