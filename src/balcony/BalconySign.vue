<script setup lang="ts">
// BalconySign — one stamped tile on the rail.
//
// The rail wears three of these side by side: Last Chaos, Idea Ledger,
// and a Reserved placeholder. Each tile carries a stamped label, a body
// value (or empty-state copy), and an optional refresh button driven by
// the parent. Visual treatment is brass-stamped on dark steel, matching
// the gadget's balcony palette.

interface Props {
    label: string;
    value: string;
    /** Optional secondary line below the value (smaller, mute colour). */
    sub?: string | null;
    /** When true, the value treatment dims — used for the Reserved slot. */
    placeholder?: boolean;
    /** When true, render a refresh icon button that emits `refresh`. */
    refreshable?: boolean;
    /** Disables the refresh button while a parent-driven read is in flight. */
    refreshing?: boolean;
}

const {label, value, sub = null, placeholder = false, refreshable = false, refreshing = false} = defineProps<Props>();
defineEmits<(event: 'refresh') => void>();
</script>

<template>
    <div
        :data-balcony-sign="label"
        :data-placeholder="placeholder ? 'true' : 'false'"
        class="border border-mz-edge bg-mz-rail/60 px-3 py-1.5 min-w-[12rem] flex items-center gap-3"
    >
        <div class="flex-1 min-w-0">
            <div class="mz-stamp-label text-[9px] leading-tight">{{ label }}</div>
            <div
                class="font-display text-sm leading-tight tracking-wide truncate"
                :class="placeholder ? 'text-mz-text-faint italic' : 'text-mz-text'"
                :title="value"
            >
                {{ value }}
            </div>
            <div v-if="sub" class="text-mz-text-mute font-mono text-[10px] leading-tight truncate" :title="sub">
                {{ sub }}
            </div>
        </div>
        <button
            v-if="refreshable"
            type="button"
            class="mz-button-icon w-6 h-6 text-mz-text-faint hover:text-mz-brass"
            :aria-label="`Refresh ${label}`"
            :data-balcony-sign-refresh="label"
            :disabled="refreshing"
            @click="$emit('refresh')"
        >
            <span v-if="refreshing">…</span>
            <span v-else>↻</span>
        </button>
    </div>
</template>
