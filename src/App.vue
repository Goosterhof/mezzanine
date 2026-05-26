<script setup lang="ts">
import {onMounted} from 'vue';

import Dispatch from './balcony/Dispatch.vue';
import {useBalconySigns} from './balcony/useBalconySigns';
import {useBriefingLibrary} from './balcony/useBriefingLibrary';
import CommandBar from './command/CommandBar.vue';
import DrydockPanel from './drydock/DrydockPanel.vue';
import HolotablePanel from './holotable/HolotablePanel.vue';
import MissionControl from './mission/MissionControl.vue';
import Roster from './roster/Roster.vue';
import ScientistCanvas from './roster/ScientistCanvas.vue';
import {useRosterBackend} from './roster/useRosterBackend';
import BalconyRail from './shell/BalconyRail.vue';
import TopBar from './shell/TopBar.vue';
import FirstRunWizard from './wizard/FirstRunWizard.vue';
import {useWizard} from './wizard/useWizard';

onMounted(() => {
    void useRosterBackend().subscribe();
    // The wizard's step 3 folds in the chronicle ack — on first boot the
    // disclosure is acknowledged when the investor opens the balcony.
    void useWizard().loadStatus();
    // Balcony state — load the rail's signs and the briefing library on boot.
    void useBalconySigns().refresh();
    void useBriefingLibrary().load();
});
</script>

<template>
    <div class="relative flex flex-col h-full bg-mz-surface text-mz-text font-body">
        <BalconyRail />
        <TopBar />
        <div class="flex flex-1 min-h-0">
            <Roster />
            <main class="relative flex-1 flex flex-col min-w-0">
                <ScientistCanvas />
                <CommandBar />
            </main>
        </div>
        <Dispatch />
        <MissionControl />
        <DrydockPanel />
        <HolotablePanel />
        <FirstRunWizard />
    </div>
</template>
