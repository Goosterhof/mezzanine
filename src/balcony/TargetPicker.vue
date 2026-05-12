<script setup lang="ts">
import {computed} from 'vue';

import {TARGET_OPTIONS, targetKey, type Target, type TargetOption} from '../roster/types';

interface Props {
    selected: Target | null;
}

const {selected} = defineProps<Props>();
const emit = defineEmits<(event: 'select', target: Target) => void>();

interface Group {
    label: string;
    options: TargetOption[];
}

const groups = computed<Group[]>(() => {
    const buckets = new Map<string, Group>();
    for (const opt of TARGET_OPTIONS) {
        let bucket = buckets.get(opt.group);
        if (!bucket) {
            bucket = {label: opt.group, options: []};
            buckets.set(opt.group, bucket);
        }
        bucket.options.push(opt);
    }
    return [...buckets.values()];
});

const selectedKey = computed(() => (selected ? targetKey(selected) : null));
</script>

<template>
    <div data-target-picker class="grid gap-4">
        <div v-for="group in groups" :key="group.label">
            <div class="mz-stamp-label mb-1.5">{{ group.label }}</div>
            <div class="flex flex-wrap gap-1.5">
                <button
                    v-for="opt in group.options"
                    :key="targetKey(opt.target)"
                    type="button"
                    :data-target-key="targetKey(opt.target)"
                    :data-selected="selectedKey === targetKey(opt.target) ? 'true' : 'false'"
                    class="px-3 py-1.5 text-xs font-display tracking-wide border transition-colors duration-100"
                    :class="
                        selectedKey === targetKey(opt.target)
                            ? 'border-mz-brass text-mz-text bg-mz-edge-soft/60'
                            : 'border-mz-edge text-mz-text-mute hover:border-mz-rule hover:text-mz-text'
                    "
                    @click="emit('select', opt.target)"
                >
                    {{ opt.label }}
                </button>
            </div>
        </div>
    </div>
</template>
