<script setup>
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';

import {drawScientist} from '../../src/observer/figure';
import {SketchPen, PAPER, INK} from '../../src/observer/pen';

const paper = ref(false);
const compact = ref(false);
const state = ref('reply');
const pinned = ref(false);
const showPins = ref(false);
const choice = ref('');
const copied = ref('');
const floor = ref(null);
const reader = ref(null);
const result = ref(null);
let floorObserver;
const status = computed(
    () =>
        ({reply: 'Ready for your next thought', working: 'Following a promising lead', question: 'A question for you'})[
            state.value
        ],
);
const code = `import { openUrl } from '@tauri-apps/plugin-opener';\n\n// Give a reference somewhere to go.\nawait openUrl('https://xtermjs.org/docs/guides/link-handling/');`;

async function copyCode() {
    try {
        await navigator.clipboard.writeText(code);
        copied.value = 'Copied';
    } catch {
        copied.value = 'Select code to copy';
    }
}
function jumpToReply() {
    state.value = 'reply';
    nextTick(() => result.value?.scrollIntoView({block: 'start'}));
}
function paintFloor() {
    const canvas = floor.value;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    const pen = new SketchPen(ctx);
    pen.beginFrame(2);
    ctx.strokeStyle = '#b6a88e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, height - 35);
    ctx.lineTo(width - 30, height - 35);
    ctx.stroke();
    for (const [x, heretic] of [
        [width * 0.25, false],
        [width * 0.75, true],
    ]) {
        drawScientist(pen, {
            x,
            groundY: height - 36,
            s: 0.5,
            heretic,
            activity: heretic && state.value === 'working' ? 'reading' : 'idle',
            walking: false,
            facing: heretic ? -1 : 1,
            t: 0.5,
            frame: 30,
        });
    }
    ctx.strokeStyle = '#92754b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(width * 0.46, height - 47);
    ctx.lineTo(width * 0.46, 38);
    ctx.bezierCurveTo(width * 0.46, 18, width * 0.54, 18, width * 0.54, 38);
    ctx.lineTo(width * 0.54, height - 47);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = '17px Caveat';
    ctx.fillText('The Mad Scientist', width * 0.25, height - 12);
    ctx.fillText('The Heretic', width * 0.75, height - 12);
    ctx.font = '11px Space Grotesk';
    ctx.fillText('THE SPEAKING TUBE', width * 0.5, height - 13);
}
onMounted(async () => {
    await document.fonts.ready;
    paintFloor();
    floorObserver = new ResizeObserver(paintFloor);
    floorObserver.observe(floor.value);
});
onBeforeUnmount(() => floorObserver?.disconnect());
watch(state, () => {
    choice.value = '';
    nextTick(paintFloor);
});
</script>

<template>
    <div class="study" :class="{paper, compact}">
        <div class="study-bar">
            <span
                ><b>DESIGN STUDY 01</b><span class="study-divider"> / </span>Scripted conversation · no live
                session</span
            >
            <div class="study-options">
                <div class="segmented" aria-label="Reading surface">
                    <button :aria-pressed="!paper" @click="paper = false">Graphite</button>
                    <button :aria-pressed="paper" @click="paper = true">Paper</button>
                </div>
                <button class="density" :aria-pressed="compact" @click="compact = !compact">
                    {{ compact ? 'Comfortable spacing' : 'Compact spacing' }}
                </button>
            </div>
        </div>

        <header class="balcony">
            <div class="brand">
                <span class="brand-mark">M<span>⌁</span></span>
                <div>THE MEZZANINE<small>Two minds. One laboratory.</small></div>
            </div>
            <nav aria-label="Study context">
                <span class="current">Conversation</span><span class="muted">Mission Control</span
                ><span class="muted">Drydock</span>
            </nav>
            <span class="edition">THE HERETIC’S MARGIN</span>
        </header>

        <main class="conversations">
            <section class="colleague original" aria-label="The Mad Scientist sample">
                <header class="nameplate">
                    <div>
                        <span class="tiny-dot"></span><strong>The Mad Scientist</strong><small>Claude · terminal</small>
                    </div>
                    <span class="small-label">SAMPLE</span>
                </header>
                <div class="terminal-sample">
                    <p class="terminal-greeting">✳ The original is at the bench.</p>
                    <p class="terminal-dim">~/Code/zmuuzn · The Mezzanine</p>
                    <div class="terminal-rule"></div>
                    <p class="terminal-prompt">❯ Give the Heretic’s conversation some character.</p>
                    <p>There is a difference between a terminal that speaks and a conversation you can read.</p>
                    <p>I’ll keep an eye on the machinery while my colleague experiments with the latter.</p>
                    <p class="terminal-dim">● Speaking Tube</p>
                    <div class="terminal-tool"><span>↳</span> No overlapping edits. The Heretic has the floor.</div>
                    <p>One condition: keep both of us visible.</p>
                    <p class="terminal-dim terminal-note">The investor ought to be able to watch the rivalry unfold.</p>
                    <span class="terminal-cursor" aria-hidden="true">▌</span>
                </div>
                <footer class="original-footer">The familiar terminal stays beside the new reading surface.</footer>
            </section>

            <section class="colleague heretic" aria-label="The Heretic sample">
                <header class="nameplate">
                    <div>
                        <span class="heretic-glyph">↯</span><strong>The Heretic</strong
                        ><small>Codex · conversation</small>
                    </div>
                    <button class="margin-button" :aria-expanded="showPins" @click="showPins = !showPins">
                        Margin <span>{{ pinned ? '1' : '0' }}</span>
                    </button>
                </header>
                <div class="state-switch">
                    <span class="small-label">TRY A MOMENT</span>
                    <div class="segmented">
                        <button
                            v-for="(label, key) in {reply: 'A reply', working: 'At work', question: 'A question'}"
                            :key="key"
                            :aria-pressed="state === key"
                            @click="state = key"
                        >
                            {{ label }}
                        </button>
                    </div>
                </div>
                <aside v-if="showPins" class="margin-drawer" aria-label="Pinned findings">
                    <div>
                        <span class="handwriting">Worth keeping.</span
                        ><button aria-label="Close margin" @click="showPins = false">×</button>
                    </div>
                    <button v-if="pinned" class="pinned-note" @click="jumpToReply">
                        01 · Give the words room to breathe. <span>↗</span>
                    </button>
                    <p v-else>Pin a reply to keep it within reach.</p>
                </aside>
                <div ref="reader" class="reader" tabindex="0" aria-label="Heretic conversation">
                    <article class="investor-message">
                        <div class="eyebrow">YOU <span>18:42</span></div>
                        <p>Can we spice up your chat? Clickable links, at least. Maybe something more.</p>
                    </article>
                    <div class="turn-separator"><span>01</span><span>A LITTLE CONSTRUCTIVE DISSENT</span><i></i></div>
                    <div class="progress-note">
                        <span>↳</span>
                        <p>
                            I’m looking at what makes a conversation easier to return to. The interesting part is what
                            we can put around the words.
                        </p>
                    </div>

                    <details class="work-trace" :open="state === 'working'">
                        <summary>
                            <span class="trace-symbol">{{ state === 'working' ? '◌' : '✓' }}</span
                            ><span>{{
                                state === 'working'
                                    ? 'Inspecting the conversation surface'
                                    : '3 steps · inspected the conversation surface'
                            }}</span
                            ><span class="trace-chevron">⌄</span>
                        </summary>
                        <div class="trace-body">
                            <div>
                                <span>READ</span>
                                <p>Terminal renderer<small>useScientistTerminals.ts</small></p>
                                <b>✓</b>
                            </div>
                            <div>
                                <span>CHECK</span>
                                <p>How links leave the balcony<small>Browser opener and terminal hyperlinks</small></p>
                                <b>✓</b>
                            </div>
                            <div>
                                <span>EXPLORE</span>
                                <p>Give replies their own typography<small>Keep tool details one click away</small></p>
                                <b>{{ state === 'working' ? '…' : '✓' }}</b>
                            </div>
                        </div>
                    </details>

                    <article v-if="state === 'reply'" ref="result" class="reply">
                        <div class="reply-top">
                            <span class="eyebrow">THE HERETIC <span>18:44</span></span
                            ><button class="pin" :aria-pressed="pinned" @click="pinned = !pinned">
                                {{ pinned ? '◆ Pinned' : '◇ Pin reply' }}
                            </button>
                        </div>
                        <h1>Give the words<br />room to breathe.</h1>
                        <p>
                            Yes. A chat should let you follow an idea, open its references, and find the useful bit
                            again tomorrow.
                        </p>
                        <p>
                            My proposal: <strong>a reading surface with a working margin.</strong> The machinery can
                            stay close without occupying every line.
                        </p>
                        <div class="proposal">
                            <span class="handwriting">The useful mischief</span>
                            <p>Pin the discovery. Fold the investigation. Keep the conversation.</p>
                        </div>
                        <h2>Every reference goes somewhere.</h2>
                        <p>
                            Readable
                            <a
                                href="https://xtermjs.org/docs/guides/link-handling/"
                                target="_blank"
                                rel="noopener noreferrer"
                                >links to the evidence <span>↗</span></a
                            >, with the destination visible when you hover. Code gets a quiet frame and a copy button.
                        </p>
                        <div class="code-block">
                            <div class="code-header">
                                <span><i></i> TypeScript</span
                                ><button @click="copyCode">{{ copied || 'Copy code' }}</button>
                            </div>
                            <pre
                                tabindex="0"
                                aria-label="TypeScript example"
                            ><code><span class="kw">import</span> { openUrl } <span class="kw">from</span> <span class="str">'@tauri-apps/plugin-opener'</span>;

<span class="comment">// Give a reference somewhere to go.</span>
<span class="kw">await</span> openUrl(<span class="str">'https://xtermjs.org/docs/guides/link-handling/'</span>);</code></pre>
                        </div>
                        <p class="footnote">Copying this example never runs it.</p>
                        <h2>A little less hunting.</h2>
                        <ul class="features">
                            <li><strong>Fold the work.</strong> Open the steps above when you want the receipts.</li>
                            <li><strong>Keep a finding.</strong> Pin this reply into the margin.</li>
                            <li>
                                <strong>See the question.</strong> Choices sit next to the explanation that prompted
                                them.
                            </li>
                        </ul>
                        <div class="reference">
                            <span>REFERENCE</span
                            ><a
                                href="https://learn.chatgpt.com/docs/app-server"
                                target="_blank"
                                rel="noopener noreferrer"
                                >Codex App Server <span>↗</span><small>Structured conversation events</small></a
                            >
                        </div>
                        <p class="signoff">Same raised eyebrow. Better typography.</p>
                    </article>

                    <article v-else-if="state === 'working'" class="working-state">
                        <span class="eyebrow">THE HERETIC · PROGRESS</span>
                        <h1>Following the thread.</h1>
                        <p>
                            The replies and the tool activity can travel separately. That gives us room to make the
                            reading calm while the work continues.
                        </p>
                        <div class="working-indicator">
                            <span>◌</span>
                            <div>
                                Exploring a structured conversation<small
                                    >The steps above stay available as they arrive.</small
                                >
                            </div>
                        </div>
                        <p class="footnote">This is the study’s sample working state.</p>
                    </article>

                    <article v-else class="question-state">
                        <span class="eyebrow">THE HERETIC · A QUESTION</span>
                        <h1>What belongs<br />in the foreground?</h1>
                        <p>
                            We can keep the investigation visible throughout, or let each reply lead with its result.
                            Both keep the details within reach.
                        </p>
                        <fieldset :disabled="!!choice">
                            <legend>Try a preference in this study</legend>
                            <button @click="choice = 'Replies first'">
                                <span
                                    ><strong>Replies first</strong
                                    ><small>Fold completed work into a single line.</small></span
                                ><span>↗</span>
                            </button>
                            <button @click="choice = 'Show the work'">
                                <span
                                    ><strong>Show the work</strong
                                    ><small>Leave the investigation expanded.</small></span
                                ><span>↗</span>
                            </button>
                        </fieldset>
                        <p v-if="choice" class="choice-result" role="status">
                            ✓ {{ choice }} selected for this preview. <button @click="choice = ''">Try again</button>
                        </p>
                        <p class="footnote">Preview only. This choice sends no message.</p>
                    </article>
                </div>
                <footer class="reading-status">
                    <span><i :class="state"></i>{{ status }}</span
                    ><button @click="reader.scrollTo({top: reader.scrollHeight})">Latest ↓</button>
                </footer>
            </section>
        </main>

        <div class="composer">
            <span class="eyebrow">TO THE HERETIC</span
            ><span class="composer-placeholder">The next experiment starts with your thought…</span
            ><span class="preview-stamp">COMPOSER PREVIEW</span>
        </div>
        <div class="brass-rule"></div>
        <canvas
            ref="floor"
            class="floor"
            role="img"
            aria-label="The Mad Scientist and the Heretic at the same long bench, joined by the Speaking Tube"
        ></canvas>
    </div>
</template>
