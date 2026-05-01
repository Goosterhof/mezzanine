import {ref} from 'vue';

export type PanelId = 'mission-control' | 'drydock' | 'dossier';

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
