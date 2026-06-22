<script setup lang="ts">
// The Crier's Watch (#00060) — the relay's watch-post on the balcony.
//
// A right-hand side drawer (copies the Drydock shell, not the Grind
// slide-down sheet) so it sits BESIDE the crier's terminal in the
// upper-storey canvas instead of burying it (the Augment-not-Replace
// principle applied to screen real-estate). Three engraved registers,
// unequal weight: a compact STATUS register at the top, a content-sized
// QUEUE register that scrolls internally, and the WATCH GLASS terminal
// that takes flex-1 and dominates the eye.

import {openUrl} from '@tauri-apps/plugin-opener';
import {FitAddon} from '@xterm/addon-fit';
import {Terminal} from '@xterm/xterm';
import {computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch} from 'vue';

import type {CrierQueueEntry} from './types';

import {useShell} from '../shell/useShell';
import {useCriersWatch} from './useCriersWatch';

const shell = useShell();
const crier = useCriersWatch();

const open = computed(() => shell.openPanel.value === 'criers-watch');
const status = computed(() => crier.state.value.status);
const queue = computed(() => crier.state.value.queue);
const busError = computed(() => crier.state.value.busError);

const glassRef = ref<HTMLElement | null>(null);
let terminal: Terminal | null = null;
let fit: FitAddon | null = null;

const lastReadLabel = computed(() => {
    const value = crier.state.value.lastReadAt;
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString();
});

const nudgeLabel = computed(() => {
    const value = crier.lastNudgeAt.value;
    return value === null ? null : new Date(value).toLocaleTimeString();
});

// The watch glass owns its OWN xterm Terminal bound to the crier's PTY
// event stream — NOT a slot borrowed from the canvas pool (that double-
// mounts and clobbers the pool's shared data handler). The composable's
// terminal sink feeds chunks here; this Terminal never participates in the
// roster pool.
function mountGlass(): void {
    if (terminal || !glassRef.value) {
        return;
    }
    terminal = new Terminal({
        convertEol: true,
        cursorBlink: false,
        disableStdin: true,
        scrollback: 5000,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 12,
        lineHeight: 1.2,
        theme: {background: '#0B0D10', foreground: '#9098A4'},
        allowProposedApi: true,
    });
    fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(glassRef.value);
    try {
        fit.fit();
    } catch {
        // jsdom / unattached layout — fit is best-effort.
    }
    crier.setTerminalSink((chunk) => {
        terminal?.write(chunk);
    });
}

function disposeGlass(): void {
    crier.setTerminalSink(null);
    if (terminal) {
        terminal.dispose();
        terminal = null;
    }
    fit = null;
}

// Refresh on open (matches the Drydock's watch-immediate pattern). When the
// drawer opens onto an armed crier, mount the glass and fit it.
watch(
    open,
    (isOpen) => {
        if (isOpen) {
            void crier.readState();
            void nextTick(() => {
                if (status.value === 'armed' && crier.scientistId.value !== null) {
                    mountGlass();
                }
            });
        }
    },
    {immediate: true},
);

// Mount/dispose the glass as the armed state flips while the panel is open.
watch(
    () => status.value === 'armed' && crier.scientistId.value !== null && open.value,
    (live) => {
        void nextTick(() => {
            if (live) {
                mountGlass();
            } else {
                disposeGlass();
            }
        });
    },
);

// Hand the PR off to the desktop browser. The bus already carries the
// prUrl end-to-end (bus → CrierQueueEntry → TS); the row just needed a
// door. opener:default is granted in capabilities/default.json. A failed
// open is swallowed — the balcony does not nag when the shell declines a
// hand-off; the URL is still legible in the row.
function openPr(entry: CrierQueueEntry): void {
    void openUrl(entry.prUrl).catch(() => {
        // Shell declined the hand-off — nothing to recover, the row remains.
    });
}

// The displayed `#` is the GitHub PR number — the last path segment of the
// prUrl (.../pull/<N>) — NOT entry.id, which is the bus's OWN request-row id
// (the bus may carry request #111 for PR #35). Only prUrl carries the real
// number; entry.id stays the Vue :key alone. Falls back to an em-dash rather
// than ever rendering a number that resolves to nothing on GitHub.
function prNumber(entry: CrierQueueEntry): string {
    return entry.prUrl.split('/').filter(Boolean).pop() ?? '—';
}

function handleEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open.value) {
        return;
    }
    shell.closePanel();
}

onMounted(() => {
    window.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
    disposeGlass();
});
</script>

<template>
    <aside
        v-show="open"
        data-panel="criers-watch"
        class="absolute top-19 right-0 bottom-0 w-[32rem] bg-mz-panel border-l border-mz-edge shadow-balcony flex flex-col z-20"
    >
        <!-- Header — copies the Drydock header -->
        <header class="flex items-center justify-between px-5 py-3 border-b border-mz-edge flex-shrink-0">
            <div>
                <div class="mz-stamp-label">Panel</div>
                <h2 class="font-display text-mz-text text-base tracking-wide mt-0.5">The Crier's Watch</h2>
            </div>
            <div class="flex items-center gap-2">
                <span v-if="lastReadLabel" class="text-mz-text-faint font-mono text-[11px]">{{ lastReadLabel }}</span>
                <button
                    type="button"
                    class="mz-button"
                    data-test="crier-refresh"
                    :disabled="crier.loading.value"
                    @click="crier.readState()"
                >
                    {{ crier.loading.value ? 'Reading…' : 'Refresh' }}
                </button>
                <button
                    type="button"
                    class="mz-button-icon"
                    aria-label="Close The Crier's Watch"
                    data-test="crier-close"
                    @click="shell.closePanel()"
                >
                    ✕
                </button>
            </div>
        </header>

        <!-- ① STATUS REGISTER — compact, ~5 rows [★ SIGNATURE] -->
        <section class="px-5 py-4 border-b border-mz-edge flex-shrink-0" data-test="crier-status">
            <div v-if="status === 'armed'">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span
                            class="inline-block w-2 h-2 rounded-full bg-mz-pulse-working animate-[mz-pulse-working_1.4s_ease-in-out_infinite] shadow-pulse flex-shrink-0"
                            data-test="crier-dot"
                        ></span>
                        <span class="font-display text-mz-pulse-awaiting text-base tracking-wide">ON PATROL</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button type="button" class="mz-button" data-test="crier-stand-down" @click="crier.standDown()">
                            Stand Down
                        </button>
                    </div>
                </div>
                <p class="mt-2 font-mono text-[11px] text-mz-text-mute">
                    Last read {{ lastReadLabel ?? '—' }} · Last nudge {{ nudgeLabel ?? 'none yet' }}
                </p>
                <p class="mt-1 font-mono text-[11px] text-mz-text-faint">
                    Patrol active — review turns consumed when PRs appear.
                </p>
                <button
                    type="button"
                    class="mz-button border-mz-brass text-mz-text mt-3"
                    data-test="crier-take-turn"
                    :disabled="crier.scientistId.value === null"
                    @click="crier.takeTurn()"
                >
                    Take a turn now
                </button>
            </div>

            <div v-else-if="status === 'idle'">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5">
                        <span class="inline-block w-2 h-2 rounded-full bg-mz-pulse-idle flex-shrink-0"></span>
                        <span class="font-display text-mz-text-mute text-base tracking-wide">STOOD DOWN</span>
                    </div>
                    <button type="button" class="mz-button" data-test="crier-arm" @click="crier.arm()">
                        Arm Patrol
                    </button>
                </div>
                <p class="mt-2 font-mono text-[11px] text-mz-text-faint">Patrol stood down. Arm to resume.</p>
            </div>

            <div v-else data-test="crier-token-missing">
                <div class="flex items-center justify-between gap-3">
                    <span class="font-display text-mz-signal text-base tracking-wide">NO TOKEN</span>
                    <button type="button" class="mz-button" data-test="crier-arm" @click="crier.arm()">
                        Arm Patrol
                    </button>
                </div>
                <p class="mt-2 font-mono text-[12px] text-mz-text-mute leading-relaxed">
                    Patrol cannot begin. No token at
                    <br />
                    <code class="font-mono text-mz-brass text-[11px]">~/.config/zmuuzn/town-crier-token</code>
                    <br />
                    Create that file (one line, chmod 600) with the lab token, then
                    <span class="text-mz-text">Arm Patrol</span>.
                </p>
            </div>
        </section>

        <!-- ② QUEUE REGISTER — content-sized, scrolls internally -->
        <section class="flex-shrink-0 max-h-[40%] overflow-y-auto" data-test="crier-queue">
            <!-- Bus-unreachable degradation (2B) — relay stays ON PATROL -->
            <p
                v-if="busError && status === 'armed'"
                class="px-5 py-2 bg-mz-pulse-crashed/10 border-b border-mz-pulse-crashed/40 text-mz-pulse-crashed font-mono text-[11px]"
                data-test="crier-bus-error"
            >
                Bus unreachable — last read {{ lastReadLabel ?? '—' }}. The crier is still on patrol; the queue could
                not be fetched.
            </p>
            <template v-else-if="status === 'armed'">
                <div class="px-5 py-2 border-b border-mz-edge">
                    <div class="mz-stamp-label">Open Reviews ({{ queue.length }})</div>
                </div>
                <div
                    v-if="queue.length === 0"
                    class="px-5 py-4 text-mz-text-faint font-mono text-[11px] italic"
                    data-test="crier-queue-empty"
                >
                    The bus is calm. Nothing to cry yet — the glass stays warm.
                </div>
                <button
                    v-for="entry in queue"
                    :key="entry.id"
                    type="button"
                    class="group block w-full text-left border-b border-mz-edge bg-mz-rail px-5 py-3 cursor-pointer transition-colors duration-100 hover:bg-mz-edge-soft/40 hover:border-l-2 hover:border-l-mz-brass focus-visible:bg-mz-edge-soft/40 focus-visible:outline-none focus-visible:border-l-2 focus-visible:border-l-mz-brass"
                    data-test="crier-queue-row"
                    :title="`Open ${entry.repo} #${prNumber(entry)} on GitHub`"
                    @click="openPr(entry)"
                >
                    <div class="flex items-center justify-between gap-3">
                        <div class="mz-stamp-label">{{ entry.repo }}</div>
                        <span class="font-mono text-[10px] text-mz-text-faint shrink-0">#{{ prNumber(entry) }}</span>
                    </div>
                    <div class="mt-1 font-mono text-[11px] text-mz-text-mute">
                        <span :class="entry.reviewCount > 0 ? 'text-mz-signal' : ''">
                            {{ entry.reviewCount }} review{{ entry.reviewCount === 1 ? '' : 's' }}
                        </span>
                    </div>
                    <div
                        class="mt-1.5 font-mono text-[10px] text-mz-text-faint group-hover:text-mz-brass group-focus-visible:text-mz-brass transition-colors duration-100"
                    >
                        Open on GitHub →
                    </div>
                </button>
            </template>
        </section>

        <!-- ③ WATCH GLASS — the embedded terminal, dominates with flex-1 -->
        <section class="flex-1 min-h-0 bg-mz-canvas relative" data-test="crier-glass">
            <div v-if="status !== 'armed'" class="absolute inset-0 flex items-center justify-center px-5 text-center">
                <p class="text-mz-text-faint font-mono text-[12px] italic">Patrol stood down. Arm to resume.</p>
            </div>
            <div v-show="status === 'armed'" ref="glassRef" class="absolute inset-0 p-2" data-test="crier-xterm"></div>
        </section>
    </aside>
</template>
