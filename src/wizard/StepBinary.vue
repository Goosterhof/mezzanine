<script setup lang="ts">
import {useWizard} from './useWizard';

const wizard = useWizard();

function onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    wizard.setClaudeBinary(el.value);
}
</script>

<template>
    <section data-wizard-step="binary" class="grid gap-3">
        <header>
            <div class="mz-stamp-label">Step 2 of 3 — The Scientist's Hand</div>
            <h3 class="font-display text-mz-text text-lg tracking-wide mt-1">
                Which <span class="font-mono text-mz-stamp">claude</span> does the Mad Scientist carry?
            </h3>
        </header>
        <p class="text-sm text-mz-text-mute font-display leading-relaxed">
            The Mad Scientist uses Claude. Leave this blank to use
            <span class="font-mono text-mz-stamp">claude</span> from
            <span class="font-mono text-mz-stamp">$PATH</span> in your laboratory environment. The Heretic uses
            <span class="font-mono text-mz-stamp">codex</span> from the same PATH. Both CLIs must already be installed
            and signed in; the Speaking Tube needs Node 24+ and its installed dependencies.
        </p>
        <div>
            <label class="mz-stamp-label block mb-1.5" for="wizard-claude-binary">Claude binary</label>
            <input
                id="wizard-claude-binary"
                data-wizard-claude-binary
                type="text"
                class="w-full mz-input font-mono"
                :value="wizard.claudeBinaryDraft.value"
                placeholder="claude"
                spellcheck="false"
                autocomplete="off"
                @input="onInput"
            />
            <p class="mt-2 text-xs text-mz-text-faint font-display leading-relaxed">
                Detected:
                <span class="font-mono text-mz-stamp">{{ wizard.detected.value.claudeBinary || 'claude' }}</span>
            </p>
        </div>
    </section>
</template>
