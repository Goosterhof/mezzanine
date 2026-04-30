import { defineStore } from "pinia";
import { ref } from "vue";
import type { ExperimentId } from "@/types/workbench";

export type PanelId = "mission-control" | "drydock" | "dossier" | null;

/**
 * The UI store — purely presentational state.
 *
 * Tracks which experiment is foregrounded on the canvas, which slide-in
 * panel (if any) is open, and whether the command bar is focused. The
 * command bar is *almost* always focused — the only exception is when an
 * inline editor (Compose Dispatch) takes focus.
 */
export const useUiStore = defineStore("ui", () => {
  const activeExperiment = ref<ExperimentId | null>(null);
  const openPanel = ref<PanelId>(null);
  const commandBarFocused = ref(true);

  function focus(id: ExperimentId): void {
    activeExperiment.value = id;
  }

  function togglePanel(panel: Exclude<PanelId, null>): void {
    openPanel.value = openPanel.value === panel ? null : panel;
  }

  function closePanel(): void {
    openPanel.value = null;
  }

  return {
    activeExperiment,
    openPanel,
    commandBarFocused,
    focus,
    togglePanel,
    closePanel,
  };
});
