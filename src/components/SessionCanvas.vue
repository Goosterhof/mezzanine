<script setup lang="ts">
import { computed } from "vue";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";
import { EXPERIMENTS } from "@/types/workbench";

const sessions = useSessionsStore();
const ui = useUiStore();

const activeMeta = computed(() =>
  ui.activeExperiment ? (EXPERIMENTS.find((e) => e.id === ui.activeExperiment) ?? null) : null,
);

const lines = computed(() => (ui.activeExperiment ? sessions.buffers[ui.activeExperiment] : []));
</script>

<template>
  <section class="flex-1 bg-wb-canvas overflow-hidden flex flex-col min-h-0">
    <header
      v-if="activeMeta"
      class="px-6 py-3 border-b border-wb-edge-soft flex items-center justify-between flex-shrink-0"
    >
      <div>
        <div class="wb-stamp-label">Active Bench</div>
        <h2 class="font-display text-wb-text text-base tracking-wide mt-0.5">
          {{ activeMeta.label }}
        </h2>
      </div>
      <div class="text-wb-text-faint font-mono text-xs">{{ activeMeta.wslRelativePath }}</div>
    </header>

    <div v-if="!activeMeta" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-md">
        <div class="wb-stamp-label mb-3">No session running</div>
        <p class="text-wb-text-mute font-display text-sm">
          Tools racked. Click an experiment to start a session.
        </p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto px-6 py-4 font-mono text-sm text-wb-stamp">
      <div v-if="lines.length === 0" class="text-wb-text-faint">
        Vise tightening… booting {{ activeMeta.label }}.
      </div>
      <pre
        v-else
        class="whitespace-pre-wrap break-words leading-relaxed"
      ><span v-for="(line, idx) in lines" :key="idx">{{ line }}
</span></pre>
    </div>
  </section>
</template>
