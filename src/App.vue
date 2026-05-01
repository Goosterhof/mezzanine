<script setup lang="ts">
import TopBar from "./shell/TopBar.vue";
import ExperimentRail from "./shell/ExperimentRail.vue";
import SessionCanvas from "./session/SessionCanvas.vue";
import CommandBar from "./command/CommandBar.vue";
</script>

<template>
  <div class="flex flex-col h-full bg-wb-surface text-wb-text font-body">
    <TopBar />
    <div class="flex flex-1 min-h-0">
      <ExperimentRail />
      <main class="flex-1 flex flex-col min-w-0">
        <SessionCanvas />
        <CommandBar />
      </main>
    </div>
  </div>
</template>
