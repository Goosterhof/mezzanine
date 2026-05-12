<script setup lang="ts">
import type {DispatchFinding} from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {findings} = defineProps<{findings: DispatchFinding[]}>();

defineEmits<{(e: 'compose'): void}>();

function severityClass(severity: string): string {
    const value = severity.toLowerCase();
    if (value.startsWith('high') || value.startsWith('critical')) {
        return 'text-mz-pulse-crashed border-mz-pulse-crashed';
    }
    if (value.startsWith('medium')) {
        return 'text-mz-signal border-mz-signal';
    }
    return 'text-mz-text-mute border-mz-edge';
}
</script>

<template>
    <section class="px-5 py-4 border-b border-mz-edge-soft">
        <header class="flex items-center justify-between mb-3">
            <h3 class="mz-stamp-label">War Room Dispatch</h3>
            <button type="button" class="mz-button" data-mc-compose @click="$emit('compose')">Compose Dispatch</button>
        </header>
        <div v-if="findings.length === 0" class="text-mz-text-faint text-sm font-display py-4">
            No active dispatches. Tools racked.
        </div>
        <ul v-else class="space-y-3">
            <li v-for="finding in findings" :key="finding.number" class="bg-mz-canvas border border-mz-edge px-3 py-2">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="mz-stamp-label text-[9px]">#{{ finding.number }}</span>
                            <h4 class="font-display text-sm text-mz-text truncate">{{ finding.title }}</h4>
                        </div>
                        <p v-if="finding.location" class="font-mono text-[11px] text-mz-text-faint mt-1 truncate">
                            {{ finding.location }}
                        </p>
                    </div>
                    <span
                        v-if="finding.severity"
                        class="text-[10px] uppercase tracking-wider font-display border px-2 py-0.5 flex-shrink-0"
                        :class="severityClass(finding.severity)"
                    >
                        {{ finding.severity }}
                    </span>
                </div>
            </li>
        </ul>
    </section>
</template>
