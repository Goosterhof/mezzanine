// useDispatch — the slide-down dispatch sheet's state.
//
// Holds three pieces of state: whether the sheet is open, the selected
// Target, and the free-form brief text. The sheet's submit action calls
// useRosterBackend().dispatch() with the current selection — that command
// is what creates the scientist on the Rust side, sends the brief as the
// opening prompt to the spawned claude pty, and pushes a new row into the
// Roster. The Briefing Library (Phase 2B) plugs in later by setting the
// brief text from a template before submit.

import {computed, ref} from 'vue';

import type {Target} from '../roster/types';

import {useRosterBackend} from '../roster/useRosterBackend';

const open = ref(false);
const target = ref<Target | null>(null);
const brief = ref('');
const submitting = ref(false);
const lastError = ref<string | null>(null);

export function useDispatch() {
    const backend = useRosterBackend();

    return {
        open,
        target,
        brief,
        submitting,
        lastError,

        canSubmit: computed(() => target.value !== null && brief.value.trim().length > 0 && !submitting.value),

        show(): void {
            open.value = true;
        },

        hide(): void {
            open.value = false;
        },

        toggle(): void {
            open.value = !open.value;
        },

        setTarget(next: Target | null): void {
            target.value = next;
        },

        setBrief(next: string): void {
            brief.value = next;
        },

        /** Dispatch the current selection, clear the form on success, close
         *  the sheet. Errors land in `lastError` and keep the sheet open
         *  so the investor can edit and retry. */
        async submit(): Promise<void> {
            if (target.value === null || brief.value.trim().length === 0) {
                return;
            }
            submitting.value = true;
            lastError.value = null;
            try {
                await backend.dispatch(target.value, brief.value.trim());
                brief.value = '';
                target.value = null;
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
            target.value = null;
            brief.value = '';
            submitting.value = false;
            lastError.value = null;
        },
    };
}
