<script setup lang="ts">
import {useShell, type PanelId} from './useShell';

const shell = useShell();

const buttons: Array<{id: PanelId; label: string; glyph: string}> = [
    {id: 'mission-control', label: 'Mission Control', glyph: 'MC'},
    {id: 'drydock', label: 'Drydock', glyph: 'DD'},
    {id: 'dossier', label: 'Dossier', glyph: 'DS'},
];
</script>

<template>
    <header class="h-11 bg-wb-rail border-b border-wb-edge flex items-center justify-between px-4 flex-shrink-0">
        <div class="flex items-center gap-3">
            <div class="text-wb-brass font-display text-sm tracking-[0.25em] uppercase">⌬ Workbench</div>
            <span class="text-wb-text-faint font-mono text-xs">v0.1</span>
        </div>
        <div class="flex items-center gap-1">
            <button
                v-for="btn in buttons"
                :key="btn.id"
                type="button"
                class="wb-button"
                :class="{'border-wb-brass text-wb-brass': shell.openPanel.value === btn.id}"
                :title="btn.label"
                @click="shell.togglePanel(btn.id)"
            >
                {{ btn.glyph }}
            </button>
        </div>
    </header>
</template>
