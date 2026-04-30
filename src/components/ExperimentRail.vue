<script setup lang="ts">
import { EXPERIMENTS } from "@/types/workbench";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";
import PulseDot from "@/components/PulseDot.vue";

const sessions = useSessionsStore();
const ui = useUiStore();
</script>

<template>
  <aside class="w-60 flex-shrink-0 bg-wb-rail border-r border-wb-edge flex flex-col">
    <div class="px-4 py-4 border-b border-wb-edge-soft">
      <div class="wb-stamp-label">Bench</div>
      <div class="font-display text-wb-text text-sm tracking-wide mt-0.5">The Workbench</div>
    </div>
    <nav class="flex-1 py-2">
      <button
        v-for="exp in EXPERIMENTS"
        :key="exp.id"
        type="button"
        class="wb-tab w-full text-left"
        :class="{ 'wb-tab-active': ui.activeExperiment === exp.id }"
        @click="ui.focus(exp.id)"
      >
        <PulseDot :state="sessions.states[exp.id]" />
        <span class="font-display text-sm">{{ exp.label }}</span>
      </button>
    </nav>
    <div class="px-4 py-3 border-t border-wb-edge-soft">
      <div class="wb-stamp-label">Vise</div>
      <div class="text-wb-text-mute text-xs mt-1 font-mono">
        {{ sessions.recency.length }} / 3 warm
      </div>
    </div>
  </aside>
</template>
