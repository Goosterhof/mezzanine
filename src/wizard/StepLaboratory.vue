<script setup lang="ts">
import {useWizard} from './useWizard';

const wizard = useWizard();

function onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    wizard.setLabRoot(el.value);
}
</script>

<template>
    <section data-wizard-step="laboratory" class="grid gap-3">
        <header>
            <div class="mz-stamp-label">Step 1 of 3 — The Laboratory</div>
            <h3 class="font-display text-mz-text text-lg tracking-wide mt-1">Where does the laboratory live?</h3>
        </header>
        <p class="text-sm text-mz-text-mute font-display leading-relaxed">
            Every scientist the Mezzanine dispatches is given a directory. The directory is always laboratory-side —
            POSIX, never Windows-style. On Windows the balcony stands on this side of the WSL2 bridge; the path you give
            here is the one bash sees on the other side.
        </p>
        <div>
            <label class="mz-stamp-label block mb-1.5" for="wizard-lab-root">Lab root</label>
            <input
                id="wizard-lab-root"
                data-wizard-lab-root
                type="text"
                class="w-full mz-input font-mono"
                :value="wizard.labRootDraft.value"
                placeholder="/home/scientist/code/zmuuzn"
                spellcheck="false"
                autocomplete="off"
                @input="onInput"
            />
            <p class="mt-2 text-xs text-mz-text-faint font-display leading-relaxed">
                Detected: <span class="font-mono text-mz-stamp">{{ wizard.detected.value.labRoot || '—' }}</span>
            </p>
        </div>
    </section>
</template>
