// useBalconySigns — singleton state + IPC for the rail's three signs.
//
// Phase 2B reads from disk: one CLAUDE.md and every idea-ledger-*.md.
// The contract matches Mission Control's: refresh on demand, sticky
// failure (keep the last good values when a read errors so the rail
// doesn't blank out on a single transient miss). The rail wires a
// per-sign refresh button as well as an "all signs" refresh on boot.

import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

import type {BalconySigns} from './types';

import {EMPTY_BALCONY_SIGNS} from './types';

const signs = ref<BalconySigns>({...EMPTY_BALCONY_SIGNS});
const loading = ref(false);
const lastError = ref<string | null>(null);
const lastRefreshedAt = ref<string | null>(null);

export function useBalconySigns() {
    return {
        signs,
        loading,
        lastError,
        lastRefreshedAt,

        /** Read the rail's payload. On error: lastError is set; the
         *  previously-rendered values stay so the rail keeps its shape. */
        async refresh(): Promise<void> {
            loading.value = true;
            lastError.value = null;
            try {
                const payload = await invoke<BalconySigns>('read_balcony_signs');
                signs.value = payload;
                lastRefreshedAt.value = new Date().toISOString();
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                loading.value = false;
            }
        },

        reset(): void {
            signs.value = {...EMPTY_BALCONY_SIGNS};
            loading.value = false;
            lastError.value = null;
            lastRefreshedAt.value = null;
        },
    };
}
