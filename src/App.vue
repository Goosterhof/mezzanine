<script setup lang="ts">
import {onMounted, ref, watch} from 'vue';

import AscentPrompt from './ascent/AscentPrompt.vue';
import {useAscent} from './ascent/useAscent';
import Dispatch from './balcony/Dispatch.vue';
import {useBalconySigns} from './balcony/useBalconySigns';
import {useBriefingLibrary} from './balcony/useBriefingLibrary';
import DrydockPanel from './drydock/DrydockPanel.vue';
import GrindPanel from './grind/GrindPanel.vue';
import {useGrind} from './grind/useGrind';
import HolotablePanel from './holotable/HolotablePanel.vue';
import MissionControl from './mission/MissionControl.vue';
import {useObserver} from './observer/useObserver';
import {useColleagues} from './roster/useColleagues';
import {useRosterBackend} from './roster/useRosterBackend';
import Balustrade from './shell/Balustrade.vue';
import ConversationPage from './shell/ConversationPage.vue';
import {useShell} from './shell/useShell';
import FirstRunWizard from './wizard/FirstRunWizard.vue';
import {useWizard} from './wizard/useWizard';
const shell = useShell();
const observer = useObserver();
const wizard = useWizard();
const mounted = ref(false);
let ascentChecked = false;
let colleaguesOpened = false;
let rosterReady: Promise<unknown> = Promise.resolve();
onMounted(() => {
    rosterReady = useRosterBackend().subscribe();
    mounted.value = true;
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

// The Ascent boot check — gated on wizard completion. `needsWalkthrough` is
// true while the wizard is checked-and-incomplete; it flips false once the
// investor opens the balcony (or on boot for a returning investor). Fire the
// silent boot check the first time the balcony is confirmed configured.
watch(
    () => mounted.value && wizard.isReady() && !wizard.needsWalkthrough.value,
    (cleared) => {
        if (cleared && !ascentChecked) {
            ascentChecked = true;
            void useAscent().check();
        }
        if (cleared && !colleaguesOpened) {
            colleaguesOpened = true;
            void rosterReady
                .then(() => useColleagues().openOnEntry())
                .catch((error: unknown) => {
                    useColleagues().bootError.value = String(error);
                });
        }
    },
    {immediate: true},
);
</script>
<template>
    <div class="relative flex flex-col h-full bg-mz-surface text-mz-text font-body">
        <Balustrade />
        <main class="relative flex-1 min-h-0 min-w-0 overflow-hidden">
            <!-- Navigation hides the conversations; their DOM, PTYs, draft and scrollback survive. -->
            <ConversationPage
                v-show="shell.page.value === 'conversation'"
                :active="shell.page.value === 'conversation'"
            />
            <MissionControl />
            <DrydockPanel />
            <HolotablePanel />
            <GrindPanel />
            <Dispatch />
        </main>
        <FirstRunWizard />
        <AscentPrompt />
    </div>
</template>
