// useMissionControl — singleton state + IPC for the Mission Control panel.
//
// Holds the four laboratory artifacts the panel renders: vital signs,
// dispatch findings, pending minion signals, and wound summaries. Refreshes
// on demand — Phase 2A's contract is "read on panel open + manual refresh
// button," not file-watching. Failure is sticky: when a read errors, the
// section's `error` is set and the section keeps its last-known data so
// the panel doesn't blank out.

import {invoke} from '@tauri-apps/api/core';
import {ref} from 'vue';

import type {DispatchFinding, MinionSignal, NewDispatchFinding, VitalSigns, WoundSummary} from './types';

import {EMPTY_VITAL_SIGNS} from './types';

const vitalSigns = ref<VitalSigns>({...EMPTY_VITAL_SIGNS});
const findings = ref<DispatchFinding[]>([]);
const signals = ref<MinionSignal[]>([]);
const wounds = ref<WoundSummary[]>([]);
const loading = ref(false);
const lastError = ref<string | null>(null);
const lastRefreshedAt = ref<string | null>(null);

export function useMissionControl() {
    return {
        vitalSigns,
        findings,
        signals,
        wounds,
        loading,
        lastError,
        lastRefreshedAt,

        /** Read all four sources in parallel and stamp the refresh timestamp.
         * On error: lastError is set; previously-read data stays in place
         * so the panel doesn't go blank on a single transient failure.
         */
        async refresh(): Promise<void> {
            loading.value = true;
            lastError.value = null;
            try {
                const [vs, df, ms, ws] = await Promise.all([
                    invoke<VitalSigns>('read_vital_signs'),
                    invoke<DispatchFinding[]>('read_war_room_dispatch'),
                    invoke<MinionSignal[]>('read_inheritance_signals'),
                    invoke<WoundSummary[]>('read_wounds_at_threshold'),
                ]);
                vitalSigns.value = vs;
                findings.value = df;
                signals.value = ms;
                wounds.value = ws;
                lastRefreshedAt.value = new Date().toISOString();
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                loading.value = false;
            }
        },

        /** Append a new finding to documents/war-room-dispatch.md and refresh. */
        async submitDispatch(finding: NewDispatchFinding): Promise<void> {
            await invoke('write_war_room_dispatch', {finding});
            await this.refresh();
        },

        reset(): void {
            vitalSigns.value = {...EMPTY_VITAL_SIGNS};
            findings.value = [];
            signals.value = [];
            wounds.value = [];
            loading.value = false;
            lastError.value = null;
            lastRefreshedAt.value = null;
        },
    };
}
