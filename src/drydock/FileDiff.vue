<script setup lang="ts">
import type {DrydockPrFile, FileEnrichment} from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const {file, enrichment} = defineProps<{
    file: DrydockPrFile;
    enrichment: FileEnrichment | undefined;
}>();

function severityBand(score: number | null): string {
    if (score === null) {
        return 'border-wb-edge text-wb-text-mute';
    }
    if (score >= 8) {
        return 'border-wb-pulse-crashed/60 text-wb-pulse-crashed';
    }
    if (score >= 5) {
        return 'border-wb-signal/60 text-wb-signal';
    }
    return 'border-wb-brass-dim text-wb-brass';
}
</script>

<template>
    <article class="border-t border-wb-edge-soft px-5 py-3 first:border-t-0">
        <header class="flex items-center justify-between gap-3 mb-2">
            <code class="font-mono text-[12px] text-wb-text break-all">{{ file.path }}</code>
            <span class="font-mono text-[10px] text-wb-text-faint shrink-0">
                <span class="text-wb-pulse-awaiting">+{{ file.additions }}</span>
                <span class="text-wb-text-faint mx-1">·</span>
                <span class="text-wb-pulse-crashed">−{{ file.deletions }}</span>
            </span>
        </header>

        <div v-if="enrichment?.loading" class="text-wb-text-faint font-mono text-[11px] italic">
            Reading lab memory…
        </div>

        <p
            v-else-if="enrichment?.error"
            class="text-wb-pulse-crashed font-mono text-[11px]"
            data-test="enrichment-error"
        >
            {{ enrichment.error }}
        </p>

        <dl v-else-if="enrichment" class="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            <dt class="wb-stamp-label pt-0.5">Last minion touch</dt>
            <dd class="text-wb-text font-mono">
                <span v-if="enrichment.minionTouch">
                    Last touched by
                    <span class="text-wb-brass">{{ enrichment.minionTouch.minion }}</span>
                    on {{ enrichment.minionTouch.date }}
                    <span class="text-wb-text-faint">({{ enrichment.minionTouch.commitHash.slice(0, 7) }})</span>
                </span>
                <span v-else class="text-wb-text-faint italic"> No minion-stamped commits found for this file </span>
            </dd>

            <dt class="wb-stamp-label pt-0.5">Open chaos detonations</dt>
            <dd class="text-wb-text font-mono">
                <ul v-if="enrichment.chaosDetonations.length" class="space-y-0.5">
                    <li
                        v-for="hit in enrichment.chaosDetonations"
                        :key="hit.reportFilename"
                        class="border-l-2 pl-2"
                        :class="severityBand(hit.madnessScore)"
                    >
                        <span class="font-mono">#{{ hit.reportNumber }}</span>
                        <span v-if="hit.madnessScore !== null" class="text-wb-text-faint">
                            · {{ hit.madnessScore }}/10
                            <span v-if="hit.madnessLabel">— {{ hit.madnessLabel }}</span>
                        </span>
                    </li>
                </ul>
                <span v-else class="text-wb-text-faint italic">No chaos detonations on record</span>
            </dd>

            <dt class="wb-stamp-label pt-0.5">Active experiment log</dt>
            <dd class="text-wb-text font-mono">
                <span v-if="enrichment.activeLog">
                    #{{ enrichment.activeLog.number }} —
                    <span class="text-wb-text">{{ enrichment.activeLog.title }}</span>
                    <span class="text-wb-text-faint"> · {{ enrichment.activeLog.status }}</span>
                </span>
                <span v-else class="text-wb-text-faint italic">No active experiment log</span>
            </dd>
        </dl>
    </article>
</template>
