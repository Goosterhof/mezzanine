<script setup lang="ts">
import {onBeforeUnmount, onMounted} from 'vue';

import {useWizard} from '../wizard/useWizard';
import {COLLEAGUES, colleagueLabel, type Colleague} from './types';
import {useColleagues} from './useColleagues';
import {useRoster} from './useRoster';

const colleagues = useColleagues();
const roster = useRoster();
const wizard = useWizard();
let timer: ReturnType<typeof setInterval> | null = null;
function visit(identity: Colleague): void {
    const scientist = colleagues.bench(identity);
    if (scientist && scientist.state !== 'done' && scientist.state !== 'crashed') roster.select(scientist.id);
    else void colleagues.open(identity);
}
function refresh(): void {
    if (wizard.isReady() && !wizard.needsWalkthrough.value) void colleagues.refreshTube();
}
onMounted(() => {
    timer = setInterval(refresh, 3000);
});
onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
});
</script>

<template>
    <section class="flex-shrink-0 border-b border-mz-edge bg-mz-rail px-6 py-3" aria-label="Your two colleagues">
        <div class="flex items-center gap-3">
            <button
                v-for="identity in COLLEAGUES"
                :key="identity"
                type="button"
                class="mz-button bg-mz-canvas text-left px-4 py-2 flex-1"
                :class="{'border-mz-brass text-mz-brass': roster.selected.value === colleagues.bench(identity)?.id}"
                :aria-pressed="roster.selected.value === colleagues.bench(identity)?.id"
                :disabled="
                    colleagues.opening.value.includes(identity) || !wizard.isReady() || wizard.needsWalkthrough.value
                "
                :data-colleague="identity"
                @click="visit(identity)"
            >
                <span class="block font-display">{{ colleagueLabel(identity) }}</span>
                <span class="block text-xs text-mz-text-mute mt-1">
                    {{ identity === 'heretic' ? 'Codex · the constructive rival' : 'Claude · the original scientist' }}
                    ·
                    {{
                        colleagues.opening.value.includes(identity)
                            ? 'Opening…'
                            : (colleagues.bench(identity)?.state ?? 'Open bench')
                    }}
                </span>
            </button>
            <div class="text-xs text-mz-text-mute" aria-live="polite" data-speaking-tube>
                <div class="mz-stamp-label mb-1">Speaking Tube</div>
                <div>Mad Scientist: {{ colleagues.tubeLabel('mad-scientist') }}</div>
                <div>Heretic: {{ colleagues.tubeLabel('heretic') }}</div>
            </div>
        </div>
        <p
            v-for="(error, identity) in colleagues.errors.value"
            :key="identity"
            role="alert"
            class="text-xs text-mz-pulse-crashed"
        >
            {{ colleagueLabel(identity) }} could not enter: {{ error }}. Click their bench to retry.
        </p>
        <p v-if="colleagues.bootError.value" role="alert" class="text-xs text-mz-pulse-crashed">
            {{ colleagues.bootError.value }}
        </p>
        <p v-if="colleagues.tubeError.value" role="alert" class="text-xs text-mz-pulse-crashed">
            The Speaking Tube could not be checked: {{ colleagues.tubeError.value }}
        </p>
        <p
            v-for="connection in colleagues.connections.value.filter(
                (c) => c.error && roster.scientists.value.some((s) => s.id === c.id),
            )"
            :key="connection.id"
            role="alert"
            class="text-xs text-mz-pulse-crashed"
        >
            {{ colleagueLabel(connection.identity) }}: {{ connection.error }}
        </p>
    </section>
</template>
