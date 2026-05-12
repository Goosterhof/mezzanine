<script setup lang="ts">
import type {DrydockPrFile, FileEnrichment} from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {file, enrichment} = defineProps<{
    file: DrydockPrFile;
    enrichment: FileEnrichment | undefined;
}>();

function severityBand(score: number | null): string {
    if (score === null) {
        return 'border-mz-edge text-mz-text-mute';
    }
    if (score >= 8) {
        return 'border-mz-pulse-crashed/60 text-mz-pulse-crashed';
    }
    if (score >= 5) {
        return 'border-mz-signal/60 text-mz-signal';
    }
    return 'border-mz-brass-dim text-mz-brass';
}
</script>

<template>
    <article class="border-t border-mz-edge-soft px-5 py-3 first:border-t-0">
        <header class="flex items-center justify-between gap-3 mb-2">
            <code class="font-mono text-[12px] text-mz-text break-all">{{ file.path }}</code>
            <span class="font-mono text-[10px] text-mz-text-faint shrink-0">
                <span class="text-mz-pulse-awaiting">+{{ file.additions }}</span>
                <span class="text-mz-text-faint mx-1">·</span>
                <span class="text-mz-pulse-crashed">−{{ file.deletions }}</span>
            </span>
        </header>

        <div v-if="enrichment?.loading" class="text-mz-text-faint font-mono text-[11px] italic">
            Reading lab memory…
        </div>

        <p
            v-else-if="enrichment?.error"
            class="text-mz-pulse-crashed font-mono text-[11px]"
            data-test="enrichment-error"
        >
            {{ enrichment.error }}
        </p>

        <dl v-else-if="enrichment" class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            <dt class="mz-stamp-label pt-0.5">Last minion touch</dt>
            <dd class="text-mz-text font-mono">
                <span v-if="enrichment.minionTouch">
                    Last touched by
                    <span class="text-mz-brass">{{ enrichment.minionTouch.minion }}</span>
                    on {{ enrichment.minionTouch.date }}
                    <span class="text-mz-text-faint">({{ enrichment.minionTouch.commitHash.slice(0, 7) }})</span>
                </span>
                <span v-else class="text-mz-text-faint italic"> No minion-stamped commits found for this file </span>
            </dd>

            <dt class="mz-stamp-label pt-0.5">Open chaos detonations</dt>
            <dd class="text-mz-text font-mono">
                <ul v-if="enrichment.chaosDetonations.length" class="space-y-0.5">
                    <li
                        v-for="hit in enrichment.chaosDetonations"
                        :key="hit.reportFilename"
                        class="border-l-2 pl-2"
                        :class="severityBand(hit.madnessScore)"
                    >
                        <span class="font-mono">#{{ hit.reportNumber }}</span>
                        <span v-if="hit.madnessScore !== null" class="text-mz-text-faint">
                            · {{ hit.madnessScore }}/10
                            <span v-if="hit.madnessLabel">— {{ hit.madnessLabel }}</span>
                        </span>
                    </li>
                </ul>
                <span v-else class="text-mz-text-faint italic">No chaos detonations on record</span>
            </dd>

            <dt class="mz-stamp-label pt-0.5">Active experiment log</dt>
            <dd class="text-mz-text font-mono">
                <span v-if="enrichment.activeLog">
                    #{{ enrichment.activeLog.number }} —
                    <span class="text-mz-text">{{ enrichment.activeLog.title }}</span>
                    <span class="text-mz-text-faint"> · {{ enrichment.activeLog.status }}</span>
                </span>
                <span v-else class="text-mz-text-faint italic">No active experiment log</span>
            </dd>
        </dl>
    </article>
</template>
