<script setup lang="ts">
import {onMounted} from 'vue';

import HistoryPane from './chronicle/HistoryPane.vue';
import PrivacyDisclosure from './chronicle/PrivacyDisclosure.vue';
import {useDisclosure} from './chronicle/useDisclosure';
import CommandBar from './command/CommandBar.vue';
import MissionControl from './mission/MissionControl.vue';
import SessionCanvas from './session/SessionCanvas.vue';
import {useBackend} from './session/useBackend';
import ExperimentRail from './shell/ExperimentRail.vue';
import TopBar from './shell/TopBar.vue';

onMounted(() => {
    void useBackend().subscribe();
    void useDisclosure().loadStatus();
});
</script>

<template>
    <div class="relative flex flex-col h-full bg-wb-surface text-wb-text font-body">
        <TopBar />
        <div class="flex flex-1 min-h-0">
            <ExperimentRail />
            <main class="relative flex-1 flex flex-col min-w-0">
                <SessionCanvas />
                <CommandBar />
                <HistoryPane />
            </main>
        </div>
        <MissionControl />
        <PrivacyDisclosure />
    </div>
</template>
