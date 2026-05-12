// useBriefingLibrary — singleton state + IPC for the Dispatch sheet's
// mission template cards.
//
// The library is small (five templates as of Phase 2B) and Rust-side
// compile-time. We still load it through IPC so the frontend doesn't
// need to mirror the prompt text; one read on boot is enough.

import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

import type {BriefingTemplate} from './types';

const templates = ref<BriefingTemplate[]>([]);
const loaded = ref(false);
const loadError = ref<string | null>(null);

export function useBriefingLibrary() {
    return {
        templates,
        loaded,
        loadError,

        /** Load templates from the Rust seed. Idempotent — subsequent
         *  calls return the cached payload unless `force` is true. */
        async load(force = false): Promise<void> {
            if (loaded.value && !force) {
                return;
            }
            loadError.value = null;
            try {
                const payload = await invoke<BriefingTemplate[]>('list_briefing_templates');
                templates.value = payload;
                loaded.value = true;
            } catch (error) {
                loadError.value = error instanceof Error ? error.message : String(error);
            }
        },

        findById(id: string): BriefingTemplate | null {
            return templates.value.find((t) => t.id === id) ?? null;
        },

        reset(): void {
            templates.value = [];
            loaded.value = false;
            loadError.value = null;
        },
    };
}
