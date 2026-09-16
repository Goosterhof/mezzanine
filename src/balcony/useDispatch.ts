// useDispatch — the slide-down dispatch sheet's state.
//
// A brief goes to the one Mad Scientist, opening that bench if needed.
// Minion selection seeds an @agent-<slug> message in the existing terminal;
// no selection simply opens/selects it. No mission creates another scientist.

import {computed, ref} from 'vue';

import type {Target} from '../roster/types';

import {useRosterBackend} from '../roster/useRosterBackend';
import {missionForMinion} from './minions';

const open = ref(false);
const minionSlug = ref<string | null>(null);
const submitting = ref(false);
const lastError = ref<string | null>(null);

// Every dispatch targets the lab root for now.
const LAB_TARGET: Target = {kind: 'lab-root'};

export function useDispatch() {
    const backend = useRosterBackend();

    return {
        open,
        minionSlug,
        submitting,
        lastError,

        // A dispatch is always submittable — "no minion" is a valid choice
        // (a plain claude session) — except while a submit is already in
        // flight.
        canSubmit: computed(() => !submitting.value),

        show(): void {
            open.value = true;
        },

        hide(): void {
            open.value = false;
        },

        toggle(): void {
            open.value = !open.value;
        },

        /** Select a minion by slug, or pass null for "no minion" (a plain
         *  session). Idempotent on re-selecting the same minion. */
        selectMinion(slug: string | null): void {
            minionSlug.value = slug;
        },

        /** Dispatch the current selection into the lab root. The mission is
         *  `@agent-<slug>` for a selected minion (claude's opening prompt),
         *  or '' for a plain session. Clears the selection and closes the
         *  sheet on success; errors land in `lastError` and keep the sheet
         *  open so the investor can retry. */
        async submit(): Promise<void> {
            if (submitting.value) {
                return;
            }
            submitting.value = true;
            lastError.value = null;
            try {
                await backend.dispatch(LAB_TARGET, missionForMinion(minionSlug.value));
                minionSlug.value = null;
                open.value = false;
            } catch (error) {
                lastError.value = error instanceof Error ? error.message : String(error);
            } finally {
                submitting.value = false;
            }
        },

        /** Test-only. */
        reset(): void {
            open.value = false;
            minionSlug.value = null;
            submitting.value = false;
            lastError.value = null;
        },
    };
}
