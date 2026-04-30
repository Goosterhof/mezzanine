<script setup lang="ts">
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();

const buttons = [
  { id: "mission-control" as const, label: "Mission Control", glyph: "MC" },
  { id: "drydock" as const, label: "Drydock", glyph: "DD" },
  { id: "dossier" as const, label: "Dossier", glyph: "DS" },
];
</script>

<template>
  <header
    class="h-11 bg-wb-rail border-b border-wb-edge flex items-center justify-between px-4 flex-shrink-0"
  >
    <div class="flex items-center gap-3">
      <div class="text-wb-brass font-display text-sm tracking-[0.25em] uppercase">⌬ Workbench</div>
      <span class="text-wb-text-faint font-mono text-xs">v0.1</span>
    </div>
    <div class="flex items-center gap-1">
      <button
        v-for="btn in buttons"
        :key="btn.id"
        type="button"
        class="wb-button"
        :class="{ 'border-wb-brass text-wb-brass': ui.openPanel === btn.id }"
        :title="btn.label"
        @click="ui.togglePanel(btn.id)"
      >
        {{ btn.glyph }}
      </button>
    </div>
  </header>
</template>
