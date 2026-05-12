// useRoster — the Mezzanine's roster state singleton.
//
// Holds the list of dispatched scientists, the recently-recalled strip, and
// which scientist the investor has currently selected (the one whose xterm
// canvas is visible, the one whose input the CommandBar feeds). The state
// is mutated only by `useRosterBackend` (in response to IPC events / command
// responses) and by selection actions from the UI.
//
// Selection rule: when the active selection is recalled, fall back to the
// most recently dispatched scientist still on the roster; if the roster
// is empty, selection drops to null.

import {computed, ref} from 'vue';

import type {RecalledScientist, Scientist, ScientistId} from './types';

const scientists = ref<Scientist[]>([]);
const recalledStrip = ref<RecalledScientist[]>([]);
const selected = ref<ScientistId | null>(null);

function selectMostRecent(): void {
    if (scientists.value.length === 0) {
        selected.value = null;
        return;
    }
    // Most-recently-dispatched first — `startedAt` is monotone per-dispatch.
    const sorted = [...scientists.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    selected.value = sorted[0]?.id ?? null;
}

export function useRoster() {
    return {
        scientists,
        recalledStrip,
        selected,

        selectedScientist: computed<Scientist | null>(() => {
            if (selected.value === null) {
                return null;
            }
            return scientists.value.find((s) => s.id === selected.value) ?? null;
        }),

        /** Replace the active roster wholesale — used by the backend after
         *  list_roster on boot or after a dispatch / recall completes. */
        replace(next: Scientist[]): void {
            scientists.value = next;
            // If the current selection is no longer on the roster, fall
            // back to the most recent scientist.
            if (selected.value !== null && !next.some((s) => s.id === selected.value)) {
                selectMostRecent();
            }
        },

        upsert(s: Scientist): void {
            const idx = scientists.value.findIndex((existing) => existing.id === s.id);
            if (idx === -1) {
                scientists.value.push(s);
            } else {
                scientists.value[idx] = s;
            }
        },

        remove(id: ScientistId): void {
            scientists.value = scientists.value.filter((s) => s.id !== id);
            if (selected.value === id) {
                selectMostRecent();
            }
        },

        setRecalledStrip(next: RecalledScientist[]): void {
            recalledStrip.value = next;
        },

        select(id: ScientistId | null): void {
            selected.value = id;
        },

        /** Test-only. */
        reset(): void {
            scientists.value = [];
            recalledStrip.value = [];
            selected.value = null;
        },
    };
}
