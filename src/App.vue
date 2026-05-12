<script setup lang="ts">
import {onMounted} from 'vue';

import Dispatch from './balcony/Dispatch.vue';
import PrivacyDisclosure from './chronicle/PrivacyDisclosure.vue';
import {useDisclosure} from './chronicle/useDisclosure';
import CommandBar from './command/CommandBar.vue';
import DrydockPanel from './drydock/DrydockPanel.vue';
import MissionControl from './mission/MissionControl.vue';
import Roster from './roster/Roster.vue';
import ScientistCanvas from './roster/ScientistCanvas.vue';
import {useRosterBackend} from './roster/useRosterBackend';
import BalconyRail from './shell/BalconyRail.vue';
import TopBar from './shell/TopBar.vue';

onMounted(() => {
    void useRosterBackend().subscribe();
    void useDisclosure().loadStatus();
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
        <PrivacyDisclosure />
    </div>
</template>
