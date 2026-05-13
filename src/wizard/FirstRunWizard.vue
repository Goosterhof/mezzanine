<script setup lang="ts">
// FirstRunWizard — the gate that opens the Mezzanine.
//
// Mounts blocking-style over the balcony until the investor walks through
// three steps: the Laboratory, the Scientist's Hand, the Chronicle. On
// the third step, the CTA reads "Open the balcony." Pressing it persists
// the wizard answers + chronicle ack atomically and dismisses.

import StepBinary from './StepBinary.vue';
import StepChronicle from './StepChronicle.vue';
import StepLaboratory from './StepLaboratory.vue';
import {useWizard} from './useWizard';

const wizard = useWizard();

async function onPrimary(): Promise<void> {
    if (wizard.isLastStep.value) {
        await wizard.submit();
        return;
    }
    wizard.goNext();
}

function onBack(): void {
    wizard.goBack();
}
</script>

<template>
    <div
        v-if="wizard.needsWalkthrough.value"
        data-modal="first-run-wizard"
        class="fixed inset-0 z-50 flex items-center justify-center bg-mz-surface/90 backdrop-blur-sm"
        role="dialog"
        aria-label="Mezzanine first-run wizard"
    >
        <div class="w-[36rem] max-w-[92vw] bg-mz-panel border border-mz-edge shadow-balcony p-7 flex flex-col gap-6">
            <header class="border-b border-mz-edge-soft pb-3">
                <div class="mz-stamp-label">The Mezzanine — first opening</div>
                <h2 class="font-display text-mz-text text-xl tracking-wide mt-1">Welcome to the balcony</h2>
            </header>

            <StepLaboratory v-if="wizard.activeStep.value === 'laboratory'" />
            <StepBinary v-else-if="wizard.activeStep.value === 'binary'" />
            <StepChronicle v-else-if="wizard.activeStep.value === 'chronicle'" />

            <footer class="flex items-center justify-between gap-2 pt-2">
                <button
                    type="button"
                    class="mz-button"
                    data-wizard-back
                    :disabled="!wizard.canGoBack.value || wizard.submitting.value"
                    @click="onBack"
                >
                    Back
                </button>
                <button
                    type="button"
                    class="mz-button border-mz-brass text-mz-text"
                    data-wizard-primary
                    :disabled="!wizard.canAdvance.value || wizard.submitting.value"
                    @click="onPrimary"
                >
                    <template v-if="wizard.isLastStep.value">
                        {{ wizard.submitting.value ? 'Opening…' : 'Open the balcony.' }}
                    </template>
                    <template v-else>Continue</template>
                </button>
            </footer>
        </div>
    </div>
</template>
