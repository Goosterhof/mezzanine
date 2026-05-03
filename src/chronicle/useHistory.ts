// useHistory — singleton state for the History pane.
//
// Holds which experiment's chronicle is being viewed, the loaded turns,
// loading state, and the open/closed flag. The pane reads on open and
// on explicit refresh; nothing watches files in the background.

import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

import type {ExperimentId} from '../session/types';
import type {ChronicleTurn} from './types';

const open = ref(false);
const experiment = ref<ExperimentId | null>(null);
const turns = ref<ChronicleTurn[]>([]);
const loading = ref(false);
const lastError = ref<string | null>(null);

const DEFAULT_DAYS = 7;

export function useHistory() {
    return {
        open,
        experiment,
        turns,
        loading,
        lastError,

        /** Open the pane for the given experiment and read the last 7 days. */
        async show(id: ExperimentId): Promise<void> {
            experiment.value = id;
            open.value = true;
            await this.refresh();
        },

        async refresh(): Promise<void> {
            if (experiment.value === null) {
                return;
            }
            loading.value = true;
            lastError.value = null;
            try {
                const result = await invoke<ChronicleTurn[]>('read_chronicle_history', {
                    experiment: experiment.value,
                    days: DEFAULT_DAYS,
                });
                turns.value = result;
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                loading.value = false;
            }
        },

        close(): void {
            open.value = false;
        },

        reset(): void {
            open.value = false;
            experiment.value = null;
            turns.value = [];
            loading.value = false;
            lastError.value = null;
        },
    };
}
