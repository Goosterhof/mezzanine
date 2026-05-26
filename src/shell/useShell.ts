import {ref} from 'vue';

// The Dossier was a Phase 3B bench-era panel design. Phase 2C retired
// it in favour of the `experiment-dossier-read` Briefing Library
// template — the scientist reads the dossier, the investor doesn't read
// a panel of markdown. The 'dossier' PanelId is therefore intentionally
// absent.
//
// Arc 2 of the absorption trilogy (#00052) widens this union to include
// `observer` — the new sibling panel to Holotable, opened from a third
// TopBar button.
export type PanelId = 'mission-control' | 'drydock' | 'holotable' | 'observer';

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
