<script setup lang="ts">
// StepChronicle — the third and final step. Refreshed for the dispatched
// model: there is no "bench output," there are "scientist transcripts."
// The submit CTA is the wizard's seal — "Open the balcony."

import {useWizard} from './useWizard';

const wizard = useWizard();
</script>

<template>
    <section data-wizard-step="chronicle" class="grid gap-3">
        <header>
            <div class="mz-stamp-label">Step 3 of 3 — The Chronicle</div>
            <h3 class="font-display text-mz-text text-lg tracking-wide mt-1">Every mission keeps a record</h3>
        </header>
        <div class="text-sm text-mz-text-mute font-display leading-relaxed space-y-3">
            <p>
                Every scientist's pty turn — what you send down, what the scientist sends back — is appended to a local
                JSONL transcript under
                <span class="font-mono text-mz-stamp">~/.zmuuzn-mezzanine/transcripts/scientists/&lt;id&gt;.jsonl</span
                >. One file per dispatched scientist; the file outlives the recall.
            </p>
            <p>
                Transcripts will contain anything that crosses the bridge — API tokens, credentials, code under review,
                and whatever the scientist surfaces in response. The files stay on this machine. Nothing is uploaded;
                nothing is committed. The Mezzanine adds the path to the laboratory's
                <span class="font-mono text-mz-stamp">.gitignore</span> as a defensive layer.
            </p>
            <p>
                The Mezzanine will not chronicle anything until you open the balcony. The act of opening is the
                acknowledgement.
            </p>
        </div>
        <p v-if="wizard.lastError.value" data-wizard-error class="text-xs text-mz-pulse-crashed font-mono">
            {{ wizard.lastError.value }}
        </p>
    </section>
</template>
