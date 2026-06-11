import {ref} from 'vue';

// The Dossier was a Phase 3B bench-era panel design. Phase 2C retired
// it in favour of the `experiment-dossier-read` Briefing Library
// template — the scientist reads the dossier, the investor doesn't read
// a panel of markdown. The 'dossier' PanelId is therefore intentionally
// absent.
//
// Arc 2 of the absorption trilogy (#00052) widened this union to include
// `observer`; Arc 3 (#00053) closed the trilogy with `grind`. The
// Overlook (#00057) narrows it again: the Observer is no longer a
// summonable panel — its scene is the permanent lower storey
// (`LabFloor.vue`), and a toggle for an always-on surface is a
// contradiction. Four panels survive on the Balustrade.
export type PanelId = 'mission-control' | 'drydock' | 'holotable' | 'grind';

const openPanel = ref<PanelId | null>(null);

export function useShell() {
    return {
        openPanel,

        togglePanel(panel: PanelId): void {
            openPanel.value = openPanel.value === panel ? null : panel;
        },

        closePanel(): void {
            openPanel.value = null;
        },

        reset(): void {
            openPanel.value = null;
        },
    };
}
