<script setup lang="ts">
import {onMounted, ref, watch} from 'vue';

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
import ObserverPanel from './observer/ObserverPanel.vue';
import {useObserver} from './observer/useObserver';
import Roster from './roster/Roster.vue';
import ScientistCanvas from './roster/ScientistCanvas.vue';
import {useRoster} from './roster/useRoster';
import {useRosterBackend} from './roster/useRosterBackend';
import BalconyRail from './shell/BalconyRail.vue';
import TopBar from './shell/TopBar.vue';
import FirstRunWizard from './wizard/FirstRunWizard.vue';
import {useWizard} from './wizard/useWizard';

const rosterRef = ref<InstanceType<typeof Roster> | null>(null);
const roster = useRoster();
const observer = useObserver();
const wizard = useWizard();

// The Ascent (#00056) — fire the boot update-check exactly once, and only
// after the first-run wizard has cleared. A brand-new install configures
// itself (lab root, claude binary, chronicle ack) before the balcony reaches
// outward to the floor below for the first time (§7 — first reach outward).
let ascentChecked = false;

onMounted(() => {
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

// Sprite-click → roster-row scroll. The Observer's setSelected path
// updates `useRoster.selected`; this watcher fans the selection out
// to the Roster component so the matching row scrolls into view.
watch(
    () => roster.selected.value,
    (id) => {
        if (id !== null) {
            rosterRef.value?.scrollToRow(id);
        }
    },
);

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
        <BalconyRail />
        <TopBar />
        <div class="flex flex-1 min-h-0">
            <Roster ref="rosterRef" />
            <main class="relative flex-1 flex flex-col min-w-0">
                <ScientistCanvas />
                <CommandBar />
            </main>
        </div>
        <Dispatch />
        <MissionControl />
        <DrydockPanel />
        <HolotablePanel />
        <ObserverPanel />
        <GrindPanel />
        <FirstRunWizard />
        <AscentPrompt />
    </div>
</template>
