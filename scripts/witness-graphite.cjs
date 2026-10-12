// Full application witness. Only Tauri/native replies are simulated.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const artifacts = process.env.CHAT_ARTIFACTS || '/tmp/mezzanine-graphite';
(async () => {
    await fs.mkdir(artifacts, {recursive: true});
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHAT_CHROME});
    const context = await browser.newContext({
        viewport: {width: 1440, height: 1000},
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await context.newPage();
    const errors = [];
    const checks = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        await page.addInitScript(() => {
            const callbacks = new Map(),
                listeners = new Map();
            let seq = 0;
            window.calls = [];
            window.chatFails = false;
            window.chatVersion = 0;
            const scientists = ['mad-scientist', 'heretic'].map((colleague) => ({
                id: colleague,
                colleague,
                target: {kind: 'lab-root'},
                mission: 'Graphite browser witness',
                state: 'idle',
                startedAt: new Date().toISOString(),
                lastStateChange: new Date().toISOString(),
            }));
            window.emitTest = (event, payload) => {
                for (const id of listeners.get(event) || []) callbacks.get(id)({event, payload, id});
            };
            window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: () => {}};
            window.__TAURI_INTERNALS__ = {
                transformCallback: (fn) => {
                    const id = ++seq;
                    callbacks.set(id, fn);
                    return id;
                },
                invoke: async (cmd, args = {}) => {
                    window.calls.push({cmd, args});
                    if (cmd === 'plugin:event|listen') {
                        listeners.set(args.event, [...(listeners.get(args.event) || []), args.handler]);
                        return args.handler;
                    }
                    if (cmd === 'read_wizard_state')
                        return {completedAt: '2026-10-12', labRoot: '/laboratory', claudeBinary: 'claude'};
                    if (cmd === 'read_wizard_detected')
                        return {labRoot: '/laboratory', claudeBinary: 'claude', hostPlatform: 'windows'};
                    if (
                        [
                            'list_roster',
                            'list_recently_recalled',
                            'list_briefing_templates',
                            'read_inheritance_signals',
                            'read_wounds_at_threshold',
                            'list_open_prs',
                        ].includes(cmd)
                    )
                        return [];
                    if (cmd === 'open_colleague') return scientists.find((s) => s.colleague === args.colleague);
                    if (cmd === 'read_tube_connections')
                        return scientists.map((s) => ({
                            id: s.id,
                            identity: s.colleague,
                            thread: s.colleague === 'heretic' ? 'exact-heretic-thread' : null,
                            delivery: s.colleague === 'heretic' ? 'queue' : 'channel',
                            error: null,
                        }));
                    if (cmd === 'read_heretic_chat') {
                        if (window.chatFails) throw new Error('simulated disconnected pipe');
                        if (args.threadId !== 'exact-heretic-thread') throw new Error('wrong thread');
                        const item = (id, kind, text, phase = null, label = '') => ({
                            id,
                            kind,
                            text,
                            phase,
                            label,
                            truncated: false,
                        });
                        if (args.cursor)
                            return {
                                threadId: args.threadId,
                                turns: [
                                    {
                                        id: 'earlier',
                                        items: [
                                            item(
                                                'old',
                                                'assistant',
                                                'An earlier finding, recovered from this same conversation.',
                                            ),
                                        ],
                                        omittedItems: 0,
                                    },
                                ],
                                nextCursor: null,
                            };
                        return {
                            threadId: args.threadId,
                            nextCursor: 'earlier-page',
                            turns: [
                                {
                                    id: 'turn-one',
                                    omittedItems: 0,
                                    items: [
                                        item(
                                            'question',
                                            'user',
                                            'Give the Heretic’s conversation a little more character.',
                                        ),
                                        item(
                                            'progress',
                                            'assistant',
                                            'I’m checking how a reference can leave the balcony without taking the conversation with it.',
                                            'commentary',
                                        ),
                                        item(
                                            'work',
                                            'tool',
                                            'Browser opener found. The two sessions remain separate.',
                                            null,
                                            'Inspecting the conversation renderer',
                                        ),
                                        item(
                                            'reply',
                                            'assistant',
                                            '# Give the words room to breathe.\n\nA readable reply, with the evidence close at hand. **Graphite is ready for a proper experiment.**\n\n```typescript\nconst graphite = "same session, better reading";\n```\n\n[Follow the evidence](https://xtermjs.org/docs/guides/link-handling/)\n\n' +
                                                Array.from(
                                                    {length: 8},
                                                    (_, i) =>
                                                        `Paragraph ${i + 1}: keep the reading line steady while fresh work arrives.`,
                                                ).join('\n\n') +
                                                (window.chatVersion ? '\n\nA new recorded update.' : ''),
                                            'final',
                                        ),
                                    ],
                                },
                            ],
                        };
                    }
                    if (cmd === 'read_vital_signs')
                        return {
                            experimentsActive: 6,
                            experimentsSummary: '6 active',
                            gadgetsCalibrated: 5,
                            gadgetsSummary: '5 calibrated',
                            packagesPublished: 1,
                            packagesSummary: '1 published',
                            minionsOperational: 18,
                            minionsSummary: '18 ready',
                            sentinelsWatching: 4,
                            sentinelsSummary: '4 watching',
                            lastChaos: '#00118',
                            chaosFiled: '118',
                            enhanceFiled: '9',
                        };
                    if (cmd === 'read_balcony_signs')
                        return {
                            lastChaos: {reportNumber: 118, label: 'The Holding', score: '7/10', raw: null},
                            ideaLedger: {candidateCount: 4, shelvedCount: 12, mostRecentDelivered: '2026-10-12'},
                        };
                    if (cmd === 'gh_auth_status') return {authenticated: true, message: ''};
                    return null;
                },
            };
        });
        await page.goto('http://127.0.0.1:1430/');
        await page.getByRole('heading', {name: 'Give the words room to breathe.'}).waitFor();
        await page.evaluate(async () => {
            const {useScientistTerminals} = await import('/src/roster/useScientistTerminals.ts');
            window.terminals = useScientistTerminals();
            window.hereticTerminal = window.terminals.get('heretic').terminal.element;
            for (const id of ['mad-scientist', 'heretic'])
                window.emitTest('scientist-output', {
                    scientist: id,
                    chunk: 'BROWSER FIXTURE — no live model\r\nReady for your next thought.\r\n',
                });
            await new Promise((r) => window.terminals.get('heretic').terminal.write('', r));
        });
        const reader = page.locator('.graphite-reader');
        await reader.evaluate((el) => (el.scrollTop = 0));
        await page.screenshot({path: path.join(artifacts, 'graphite-live-layout.png')});
        await page.getByRole('button', {name: 'Copy code', exact: true}).click();
        assert.equal(
            await page.evaluate(() => navigator.clipboard.readText()),
            'const graphite = "same session, better reading";\n',
        );
        await page.getByRole('link', {name: 'Follow the evidence'}).click();
        await page.screenshot({path: path.join(artifacts, 'graphite-code-and-reference.png')});
        assert.equal(
            await page.evaluate(() =>
                window.calls.some(
                    (c) =>
                        c.cmd === 'plugin:opener|open_url' &&
                        c.args.url === 'https://xtermjs.org/docs/guides/link-handling/',
                ),
            ),
            true,
        );
        await page.getByRole('button', {name: 'Pin reply', exact: false}).click();
        await page.getByRole('button', {name: 'Margin · 1'}).click();
        await page
            .getByRole('complementary', {name: 'Pinned replies'})
            .getByRole('button', {name: /Give the words/})
            .click();
        await page.getByRole('button', {name: 'Back to conversation'}).click();
        await page.getByRole('button', {name: '1 recorded work steps', exact: false}).click();
        await page.getByText('Inspecting the conversation renderer', {exact: true}).click();
        checks.push(
            'Rendered Markdown, highlighted code copied verbatim, web link opens through Tauri, pin/revisit and work details',
        );
        await page.getByRole('button', {name: 'Load earlier replies ↑'}).click();
        assert.equal(await page.getByText('An earlier finding, recovered from this same conversation.').count(), 1);
        await reader.evaluate((el) => (el.scrollTop = 30));
        await page.waitForTimeout(100);
        const readingLine = await reader.evaluate((el) => el.scrollTop);
        await page.evaluate(() => {
            window.chatVersion = 1;
        });
        await page.waitForTimeout(4500);
        assert.equal(await reader.evaluate((el) => el.scrollTop), readingLine);
        checks.push('Older pagination and a new recorded update preserve the reading line');
        await page.getByRole('button', {name: 'Expand CLI', exact: true}).click();
        assert.equal(await page.locator('[data-heretic-chat]').isVisible(), false);
        assert.equal(
            await page.evaluate(() => window.terminals.get('heretic').terminal.element === window.hereticTerminal),
            true,
        );
        await page.getByRole('button', {name: 'Return to Graphite'}).click();
        assert.equal(await page.locator('[data-heretic-chat]').isVisible(), true);
        checks.push('Expanded CLI and Graphite share the same still-mounted terminal');
        await page.locator('[data-terminal-pane="heretic"]>button').click();
        await page.locator('[data-command-input]').fill('A follow-up for this same Heretic');
        await page.locator('[data-command-input]').press('Enter');
        assert.equal(
            await page.evaluate(() =>
                window.calls.some(
                    (c) =>
                        c.cmd === 'write_to_scientist' &&
                        c.args.id === 'heretic' &&
                        c.args.input === 'A follow-up for this same Heretic\r',
                ),
            ),
            true,
        );
        await page.locator('[data-command-input]').fill('Keep this draft');
        await page.locator('[data-page-link="mission-control"]').click();
        const reads = await page.evaluate(() => window.calls.filter((c) => c.cmd === 'read_heretic_chat').length);
        await page.waitForTimeout(4200);
        assert.equal(
            await page.evaluate(() => window.calls.filter((c) => c.cmd === 'read_heretic_chat').length),
            reads,
        );
        await page.locator('[data-page-link="conversation"]').click();
        assert.equal(await page.locator('[data-command-input]').inputValue(), 'Keep this draft');
        assert.equal(await page.evaluate(() => window.calls.filter((c) => c.cmd === 'open_colleague').length), 2);
        checks.push('Composer reaches existing PTY; page changes retain draft and sessions and suspend reader polling');
        await page.setViewportSize({width: 1080, height: 720});
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const dock = await page.locator('[data-terminal="heretic"]').boundingBox();
        assert.ok(dock.height >= 96);
        await page.screenshot({path: path.join(artifacts, 'graphite-compact-layout.png')});
        await page.evaluate(() => {
            window.chatFails = true;
        });
        await page.waitForTimeout(4500);
        await page.getByRole('alert').filter({hasText: 'could not update'}).waitFor();
        assert.equal(await page.locator('[data-terminal="heretic"] .xterm').isVisible(), true);
        checks.push('1080×720 layout and failed-read fallback retain visible CLI controls');
        assert.deepEqual(errors, []);
        await fs.writeFile(
            path.join(artifacts, 'receipt.json'),
            JSON.stringify(
                {
                    checks,
                    errors,
                    boundary:
                        'Real Vue/xterm in Chromium; simulated Tauri IPC and conversation page data. Native reader has separate live-read evidence.',
                },
                null,
                2,
            ),
        );
        console.log(JSON.stringify({checks, errors, artifacts}, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
