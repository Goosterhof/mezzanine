<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import type {ErrandSill} from '../observer/LabScene.vue';

import CommandBar from '../command/CommandBar.vue';
import {type ErrandEvent, voiceLine} from '../observer/errands';
import LabFloor from '../observer/LabFloor.vue';
import {SHORT_WINDOW_H} from '../observer/projection';
import {type PageRect, type SillEnvelope, type SillRects, sillEnvelope} from '../observer/sill';
import {useObserver} from '../observer/useObserver';
import ColleagueBenches from '../roster/ColleagueBenches.vue';
import RecentlyRecalledStrip from '../roster/RecentlyRecalledStrip.vue';
import ScientistCanvas from '../roster/ScientistCanvas.vue';
import {useRoster} from '../roster/useRoster';
import RailingDivider from './RailingDivider.vue';
import TornPaperEdge from './TornPaperEdge.vue';

const {active = true, compactFloor = false} = defineProps<{active?: boolean; compactFloor?: boolean}>();
const labFloorRef = ref<InstanceType<typeof LabFloor> | null>(null);
const sectionRef = ref<HTMLElement | null>(null);
const sillRef = ref<HTMLCanvasElement | null>(null);
const dividerRef = ref<InstanceType<typeof RailingDivider> | null>(null);
const roster = useRoster();
const observer = useObserver();

// The Long Bench (#00041 §5, ruled 2026-09-22) defaults EXPANDED: a 64px
// default answered the investor's "lively" with a sliver. The ⌃ control on
// the band flips this choice to the 64px crop of the same drawing when
// terminal height matters; a short window forces the crop regardless.
const floorCompact = ref(compactFloor);
watch(
    () => compactFloor,
    (next) => {
        floorCompact.value = next;
    },
);
const shortWindow = ref(window.innerHeight < SHORT_WINDOW_H);

// --- The plumb-line (#00057 §4) ------------------------------------------
// plumbX is the selected figure's CURRENT x, expressed relative to the
// RailingDivider's left edge. It re-reads on every selection change, on
// window resize, on a posture change, and on every frame the selected
// figure moves (the band's `placed` event) — so while a colleague walks,
// the line walks with them. It lands on the figure, never on where the
// figure is going (#00041 §2.3 D4, trip-wire 8).
const plumbX = ref<number | null>(null);
const plumbLength = ref(160);
const plumbDropping = ref(false);
let plumbDropTimer: ReturnType<typeof setTimeout> | null = null;

function dividerOrigin(): {left: number; top: number} {
    const dividerEl = dividerRef.value?.$el as HTMLElement | undefined;
    const rect = dividerEl?.getBoundingClientRect();
    return {left: rect?.left ?? 0, top: rect?.top ?? 0};
}

function recomputePlumb(): void {
    if (!active) return;
    const id = roster.selected.value;
    const point = id === null ? null : (labFloorRef.value?.stationToPage(id) ?? null);
    if (!point) {
        plumbX.value = null;
        return;
    }
    const origin = dividerOrigin();
    plumbX.value = point.x - origin.left;
    plumbLength.value = Math.max(16, point.y - origin.top);
}

function dropPlumb(): void {
    if (plumbDropTimer !== null) {
        clearTimeout(plumbDropTimer);
    }
    plumbDropping.value = true;
    plumbDropTimer = setTimeout(() => {
        plumbDropping.value = false;
        plumbDropTimer = null;
    }, 320);
}

// --- The Rail (#00067 P2) -------------------------------------------------
// The sill a minion climbs into when it grips the brass is measured from the
// page every time the layout moves, never hard-coded: the command bar, the
// input and its two stamps (the investor's own text — tier 3), the divider,
// the torn edge, the bench canvas and both terminal panes. Its top edge IS
// the ceiling, so the canvas cannot reach the investor's text. A null
// envelope is a legitimate state: no grip, a waiter keeps its post.
const sillEnv = ref<SillEnvelope | null>(null);

function rectIn(section: DOMRect, el: Element | null, name: string): PageRect | undefined {
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return {x: r.left - section.left, y: r.top - section.top, w: r.width, h: r.height, name};
}

function measureSill(): void {
    const section = sectionRef.value;
    if (!section || !active) return;
    const box = section.getBoundingClientRect();
    const q = (sel: string): Element | null => section.querySelector(sel);
    const bar = q('[data-command-bar]');
    const rects: Partial<SillRects> = {
        bar: rectIn(box, bar, 'command bar'),
        input: rectIn(box, q('[data-command-input]'), 'command input'),
        stamps: [...(bar?.querySelectorAll('.mz-stamp-label') ?? [])].map(
            (el, i) => rectIn(box, el, i === 0 ? 'DIRECT stamp' : 'TO: stamp') as PageRect,
        ),
        divider: rectIn(box, q('[data-railing-divider]'), 'divider'),
        torn: rectIn(box, q('[data-torn-paper-edge]'), 'torn'),
        bench: rectIn(box, q('[data-observer-canvas]'), 'bench'),
        paneMs: rectIn(box, q('[data-terminal-pane="mad-scientist"]'), 'Mad Scientist pane'),
        paneHer: rectIn(box, q('[data-terminal-pane="heretic"]'), 'Heretic pane'),
    };
    sillEnv.value = sillEnvelope(rects);
}

/** The plumb-line in the section's own coordinates (the sill keeps clear of it, ±24). */
const plumbInSection = computed(() => {
    if (plumbX.value === null || !sectionRef.value) return null;
    return plumbX.value + dividerOrigin().left - sectionRef.value.getBoundingClientRect().left;
});

const sill = computed<ErrandSill | null>(() =>
    sillEnv.value ? {canvas: sillRef.value, envelope: sillEnv.value, plumbX: plumbInSection.value} : null,
);

// The live region (#00042 §15, the Gift): one polite line per volley and per
// held wait; returns make no event, so they stay silent.
const errandVoice = ref('');
function onErrand(event: ErrandEvent): void {
    errandVoice.value = voiceLine(event);
}

let sectionObserver: ResizeObserver | null = null;

// The Recently Recalled strip lost its dock when the railing plates
// retired (#00059 J-3 — it sat at the rail's right end inside the
// plate rail). The 5-minute TTL ledger survives; it docks directly
// under the Balustrade now, and only while it has entries.
const hasRecalledStrip = computed(() => roster.recalledStrip.value.length > 0);

function onWindowResize(): void {
    shortWindow.value = window.innerHeight < SHORT_WINDOW_H;
    recomputePlumb();
    measureSill();
}

onMounted(() => {
    window.addEventListener('resize', onWindowResize);
    void nextTick(measureSill);
    if (sectionRef.value) {
        sectionObserver = new ResizeObserver(measureSill);
        sectionObserver.observe(sectionRef.value);
    }
});
onBeforeUnmount(() => {
    window.removeEventListener('resize', onWindowResize);
    sectionObserver?.disconnect();
    sectionObserver = null;
    if (plumbDropTimer) clearTimeout(plumbDropTimer);
});
// Selection → the signature gesture (#00057 §4, reframed by #00059 §4:
// "The Figure Under Study"). Figure clicks and caption clicks on the
// page land in `useRoster.selected`; this watcher fans the selection
// out: the pencil plumb-line drops on the figure, the construction
// ghosts appear on the selected figure (LabScene → setSelected), its
// wash lifts on the bench, and the terminal rises
// (ScientistCanvas). On select(null) the gesture unwinds without
// ceremony — the railing simply lets go. (The plate-scroll duty retired
// with the DOM nameplates in #00059 J-3.)
watch(
    () => roster.selected.value,
    (id) => {
        void nextTick(() => {
            recomputePlumb();
            if (id !== null) {
                dropPlumb();
            }
        });
    },
);

// The selected colleague's activity changes where they are going; the
// band's `placed` event then carries the line along the walk itself.
watch(
    () => {
        const id = roster.selected.value;
        return id === null ? null : observer.activities.value.get(id)?.state;
    },
    () => {
        void nextTick(() => {
            recomputePlumb();
        });
    },
);

// The posture re-cuts the band — recompute against the new geometry.
watch(
    () => [floorCompact.value, shortWindow.value],
    () => {
        void nextTick(() => {
            recomputePlumb();
            measureSill();
        });
    },
);

watch(
    () => active,
    (visible) => {
        if (!visible) return;
        void nextTick(() => {
            recomputePlumb();
            measureSill();
        });
    },
);
</script>
<template>
    <section
        ref="sectionRef"
        class="relative flex flex-col h-full min-h-0 min-w-0"
        aria-label="Conversation"
        data-page="conversation"
    >
        <ColleagueBenches />
        <RecentlyRecalledStrip v-if="hasRecalledStrip" />
        <ScientistCanvas :active="active" />
        <CommandBar />
        <RailingDivider ref="dividerRef" :selected-x="plumbX" :drop-length="plumbLength" :dropping="plumbDropping" />
        <TornPaperEdge />
        <LabFloor
            ref="labFloorRef"
            v-model:collapsed="floorCompact"
            :forced="shortWindow"
            :active="active"
            :sill="sill"
            @placed="recomputePlumb"
            @errand="onErrand"
        />
        <!-- The Rail (#00042 §7.4): bounds come from the measured envelope, never hard-coded.
             Its top edge IS the ceiling, so the canvas physically cannot paint into tier 3. -->
        <canvas
            v-show="sillEnv !== null"
            ref="sillRef"
            class="absolute pointer-events-none z-20"
            :style="
                sillEnv
                    ? {
                          left: `${sillEnv.x}px`,
                          top: `${sillEnv.top}px`,
                          width: `${sillEnv.w}px`,
                          height: `${sillEnv.h}px`,
                      }
                    : {}
            "
            aria-hidden="true"
            tabindex="-1"
            data-errand-sill
        ></canvas>
        <!-- One line per volley and per held wait; returns are silent (§6 Voice) -->
        <p class="sr-only" aria-live="polite" data-errand-voice>{{ errandVoice }}</p>
    </section>
</template>
