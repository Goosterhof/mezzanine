<script setup lang="ts">
import {PAGES, useShell} from './useShell';
const shell = useShell();
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
                {{ destination.label }}
            </button>
        </nav>
    </header>
</template>
