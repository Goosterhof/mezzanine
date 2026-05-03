<script setup lang="ts">
import {computed} from 'vue';

import {useDisclosure} from './useDisclosure';

const disclosure = useDisclosure();

const visible = computed(() => disclosure.needsAcknowledgement());

async function acknowledge(): Promise<void> {
    await disclosure.acknowledge();
}
</script>

<template>
    <div
        v-if="visible"
        data-modal="chronicle-disclosure"
        class="fixed inset-0 z-50 flex items-center justify-center bg-wb-surface/90 backdrop-blur-sm"
    >
        <div class="w-[32rem] max-w-[90vw] bg-wb-panel border border-wb-edge shadow-bench p-6 flex flex-col gap-4">
            <header>
                <div class="wb-stamp-label">First boot — one-time notice</div>
                <h2 class="font-display text-wb-text text-lg tracking-wide mt-1">The Chronicle</h2>
            </header>
            <div class="text-sm text-wb-text-mute font-display leading-relaxed space-y-3">
                <p>
                    Every pty turn (your input + the bench's output) will be appended to a local JSONL file under
                    <span class="font-mono text-wb-stamp">~/.zmuuzn-cockpit/transcripts/</span>. A new file is rotated
                    for each calendar day per experiment.
                </p>
                <p>
                    These transcripts may contain API tokens, credentials, code under review, and other sensitive
                    material — anything that scrolls past the bench. The files stay on this machine; nothing is
                    uploaded, nothing is committed. The path is added to the laboratory's
                    <span class="font-mono text-wb-stamp">.gitignore</span> as a defensive layer.
                </p>
                <p>
                    The bench will not chronicle anything until you acknowledge. The Apprentice's successor has to be a
                    chronicler — confirm to begin the record.
                </p>
            </div>
            <p v-if="disclosure.lastError.value" class="text-wb-pulse-crashed font-mono text-xs">
                {{ disclosure.lastError.value }}
            </p>
            <div class="flex justify-end pt-2">
                <button
                    type="button"
                    class="wb-button border-wb-brass text-wb-brass"
                    data-disclosure-ack
                    :disabled="disclosure.submitting.value"
                    @click="acknowledge"
                >
                    {{ disclosure.submitting.value ? 'Stamping…' : 'I understand — begin chronicling' }}
                </button>
            </div>
        </div>
    </div>
</template>
