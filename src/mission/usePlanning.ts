import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

export interface BacklogItem {
    id: string;
    filed: string;
    source: string;
    item: string;
    handler: string;
}
export interface PlanningSnapshot {
    items: BacklogItem[];
    priorities: BacklogItem[];
    revision: string;
    backlogPath: string;
}
const snapshot = ref<PlanningSnapshot>({items: [], priorities: [], revision: '', backlogPath: ''});
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

export function plain(text: string): string {
    return text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*`]/g, '')
        .replace(/\\\|/g, '|');
}
export function age(filed: string): string {
    return `${Math.max(0, Math.floor((Date.now() - Date.parse(`${filed}T00:00:00Z`)) / 86400000))}d`;
}
export function usePlanning() {
    return {
        snapshot,
        loading,
        saving,
        error,
        async refresh(): Promise<void> {
            if (loading.value || saving.value) return;
            loading.value = true;
            error.value = null;
            try {
                snapshot.value = await invoke<PlanningSnapshot>('read_planning');
            } catch (e) {
                error.value = String(e);
            } finally {
                loading.value = false;
            }
        },
        async save(ids: string[]): Promise<void> {
            if (saving.value || loading.value) return;
            saving.value = true;
            error.value = null;
            try {
                snapshot.value = await invoke<PlanningSnapshot>('save_priorities', {
                    expectedRevision: snapshot.value.revision,
                    ids,
                });
            } catch (e) {
                error.value = String(e);
            } finally {
                saving.value = false;
            }
        },
        reset(): void {
            snapshot.value = {items: [], priorities: [], revision: '', backlogPath: ''};
            loading.value = saving.value = false;
            error.value = null;
        },
    };
}
