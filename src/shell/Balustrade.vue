<script setup lang="ts">
import {useServiceMonitor} from '../holotable/useServiceMonitor';
import {PAGES, useShell} from './useShell';
const shell = useShell();
const monitor = useServiceMonitor();
</script>
<template>
    <header
        class="flex-shrink-0 flex items-center gap-6 px-4 border-b border-mz-edge bg-mz-rail"
        style="min-height: 44px"
        data-balustrade
    >
        <span class="mz-stamp-label whitespace-nowrap">⌬ The Mezzanine</span>
        <nav aria-label="Mezzanine pages" class="flex gap-1 min-w-0 overflow-x-auto py-1">
            <button
                v-for="destination in PAGES"
                :key="destination.id"
                type="button"
                class="mz-button bg-transparent whitespace-nowrap"
                :class="{'border-mz-brass text-mz-brass': shell.page.value === destination.id}"
                :aria-current="shell.page.value === destination.id ? 'page' : undefined"
                :data-page-link="destination.id"
                @click="shell.navigate(destination.id)"
            >
                {{ destination.label
                }}<span
                    v-if="destination.id === 'holotable' && (monitor.attention.value || monitor.error.value)"
                    class="ml-1 text-mz-signal"
                    >· {{ monitor.error.value ? '?' : monitor.attention.value }}</span
                >
            </button>
        </nav>
    </header>
    <div
        v-if="monitor.notice.value"
        role="status"
        class="px-4 py-2 bg-mz-rail border-b border-mz-edge text-sm flex items-center gap-3"
    >
        <button class="flex-1 text-left text-mz-signal" @click="shell.navigate('holotable')">
            {{ monitor.notice.value }}
        </button>
        <button class="mz-button" aria-label="Dismiss service notice" @click="monitor.notice.value = null">
            Dismiss
        </button>
    </div>
</template>
