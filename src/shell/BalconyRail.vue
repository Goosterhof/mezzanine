<script setup lang="ts">
import {useDispatch} from '../balcony/useDispatch';

const dispatch = useDispatch();

function toggleDispatch(): void {
    dispatch.toggle();
}
</script>

<template>
    <header
        class="h-14 flex-shrink-0 border-b border-mz-edge bg-mz-rail flex items-center justify-between px-6"
        data-balcony-rail
    >
        <div class="flex items-center gap-6">
            <div>
                <div class="mz-stamp-label">The Mezzanine</div>
                <div class="font-display text-mz-text text-sm tracking-wide">Balcony overlooking the lab floor</div>
            </div>
        </div>
        <div class="flex items-center gap-3">
            <!-- Balcony signs (Last Chaos, Idea Ledger, ...) land in Phase 2B.
                 The rail currently ships the chrome and the Dispatch trigger only. -->
            <button
                type="button"
                class="mz-button border-mz-brass text-mz-text px-4 py-2"
                data-dispatch-trigger
                @click="toggleDispatch"
            >
                Dispatch ▾
            </button>
        </div>
    </header>
</template>
