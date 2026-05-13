import {ref} from 'vue';

// The Dossier was a Phase 3B bench-era panel design. Phase 2C retired
// it in favour of the `experiment-dossier-read` Briefing Library
// template — the scientist reads the dossier, the investor doesn't read
// a panel of markdown. The 'dossier' PanelId is therefore intentionally
// absent.
export type PanelId = 'mission-control' | 'drydock';

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
