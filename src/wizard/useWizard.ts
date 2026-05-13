// useWizard — singleton state for the Mezzanine's first-run wizard.
//
// On boot, App.vue calls `loadStatus()`. The Tauri commands `read_wizard_state`
// and `read_wizard_detected` populate the persisted choices (if any) and the
// detected defaults the form pre-fills with. The wizard renders blocking-
// style iff `needsWalkthrough()` returns true (state checked AND no
// `completedAt` on file).
//
// Three steps live in `WIZARD_STEP_ORDER`. The composable owns the active
// step, the draft inputs, the submitting flag, and the final atomic
// submission — which writes the wizard state via `complete_wizard` and
// the chronicle ack via `write_chronicle_disclosure_ack` in sequence.

import {invoke} from '@tauri-apps/api/core';
import {computed, ref} from 'vue';

import type {WizardDetected, WizardState, WizardStepId, WizardSubmission} from './types';

import {EMPTY_WIZARD_DETECTED, EMPTY_WIZARD_STATE, WIZARD_STEP_ORDER} from './types';

const FIRST_STEP: WizardStepId = 'laboratory';
const LAST_STEP: WizardStepId = 'chronicle';

const persisted = ref<WizardState>({...EMPTY_WIZARD_STATE});
const detected = ref<WizardDetected>({...EMPTY_WIZARD_DETECTED});
const checked = ref(false);
const submitting = ref(false);
const lastError = ref<string | null>(null);

const activeStep = ref<WizardStepId>(FIRST_STEP);
const labRootDraft = ref('');
const claudeBinaryDraft = ref('');

function applyDefaults(): void {
    labRootDraft.value =
        persisted.value.labRoot && persisted.value.labRoot.trim().length > 0
            ? persisted.value.labRoot
            : detected.value.labRoot;
    claudeBinaryDraft.value =
        persisted.value.claudeBinary && persisted.value.claudeBinary.trim().length > 0
            ? persisted.value.claudeBinary
            : detected.value.claudeBinary;
}

async function loadStatusInternal(): Promise<void> {
    try {
        const [state, det] = await Promise.all([
            invoke<WizardState>('read_wizard_state'),
            invoke<WizardDetected>('read_wizard_detected'),
        ]);
        persisted.value = state;
        detected.value = det;
        applyDefaults();
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error);
    } finally {
        checked.value = true;
    }
}

function stepAt(offset: number): WizardStepId | null {
    const idx = WIZARD_STEP_ORDER.indexOf(activeStep.value);
    if (idx < 0) {
        return null;
    }
    const target = idx + offset;
    if (target < 0 || target >= WIZARD_STEP_ORDER.length) {
        return null;
    }
    return WIZARD_STEP_ORDER[target] ?? null;
}

async function submitInternal(): Promise<void> {
    if (submitting.value) {
        return;
    }
    const trimmedLab = labRootDraft.value.trim();
    if (trimmedLab.length === 0) {
        lastError.value = 'The laboratory needs a home before the wizard can close.';
        activeStep.value = FIRST_STEP;
        return;
    }
    submitting.value = true;
    lastError.value = null;
    try {
        const trimmedBinary = claudeBinaryDraft.value.trim();
        const payload: WizardSubmission = {
            labRoot: trimmedLab,
            claudeBinary: trimmedBinary.length > 0 ? trimmedBinary : null,
        };
        const next = await invoke<WizardState>('complete_wizard', {submission: payload});
        persisted.value = next;
        await invoke<string>('write_chronicle_disclosure_ack');
    } catch (error) {
        lastError.value = error instanceof Error ? error.message : String(error);
    } finally {
        submitting.value = false;
    }
}

export function useWizard() {
    return {
        persisted,
        detected,
        checked,
        submitting,
        lastError,
        activeStep,
        labRootDraft,
        claudeBinaryDraft,

        isReady(): boolean {
            return checked.value;
        },

        needsWalkthrough: computed((): boolean => checked.value && persisted.value.completedAt === null),

        canGoBack: computed((): boolean => activeStep.value !== FIRST_STEP),

        isFirstStep: computed((): boolean => activeStep.value === FIRST_STEP),

        isLastStep: computed((): boolean => activeStep.value === LAST_STEP),

        canAdvance: computed((): boolean => {
            if (activeStep.value === 'laboratory') {
                return labRootDraft.value.trim().length > 0;
            }
            return true;
        }),

        loadStatus: loadStatusInternal,

        goNext(): void {
            const next = stepAt(1);
            if (next) {
                activeStep.value = next;
            }
        },

        goBack(): void {
            const prev = stepAt(-1);
            if (prev) {
                activeStep.value = prev;
            }
        },

        setLabRoot(value: string): void {
            labRootDraft.value = value;
        },

        setClaudeBinary(value: string): void {
            claudeBinaryDraft.value = value;
        },

        submit: submitInternal,

        reset(): void {
            persisted.value = {...EMPTY_WIZARD_STATE};
            detected.value = {...EMPTY_WIZARD_DETECTED};
            checked.value = false;
            submitting.value = false;
            lastError.value = null;
            activeStep.value = FIRST_STEP;
            labRootDraft.value = '';
            claudeBinaryDraft.value = '';
        },
    };
}
