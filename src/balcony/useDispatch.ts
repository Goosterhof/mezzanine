// useDispatch — the slide-down dispatch sheet's state.
//
// Holds four pieces of state: whether the sheet is open, the selected
// Target, the currently selected briefing template (or null for pure
// free-form), and the free-form brief text. The sheet's submit action
// calls useRosterBackend().dispatch() with the brief that ends up in the
// textarea — whether that came from a template prefill or the investor's
// own typing. The composable owns the prefill semantics so the component
// stays declarative.

import {computed, ref} from 'vue';

import type {Target} from '../roster/types';
import type {BriefingTemplate} from './types';

import {useRosterBackend} from '../roster/useRosterBackend';
import {useBriefingLibrary} from './useBriefingLibrary';

const open = ref(false);
const target = ref<Target | null>(null);
const brief = ref('');
const templateId = ref<string | null>(null);
const submitting = ref(false);
const lastError = ref<string | null>(null);

export function useDispatch() {
    const backend = useRosterBackend();
    const library = useBriefingLibrary();

    function applyTemplatePrefill(tpl: BriefingTemplate): void {
        brief.value = tpl.openingPrompt;
    }

    return {
        open,
        target,
        brief,
        templateId,
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
            // Editing the brief manually unbinds the template — the
            // investor's text is now their own, not the library's.
            templateId.value = null;
        },

        /** Select (or unselect) a template by id. Selecting prefills the
         *  brief with the template's opening prompt; unselecting leaves
         *  whatever is in the textarea so the investor can keep editing. */
        selectTemplate(id: string | null): void {
            if (id === null) {
                templateId.value = null;
                return;
            }
            const tpl = library.findById(id);
            if (!tpl) {
                templateId.value = null;
                return;
            }
            templateId.value = id;
            applyTemplatePrefill(tpl);
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
                templateId.value = null;
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
            templateId.value = null;
            submitting.value = false;
            lastError.value = null;
        },
    };
}
