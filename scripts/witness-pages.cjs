// Actual Vue/xterm rendering with a fully simulated Tauri boundary.
// Requires Playwright with Chromium and npm run dev on port 1430.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const artifact = (name) => path.resolve(process.env.CHAT_ARTIFACTS || path.resolve(__dirname, '../documents'), name);
(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHAT_CHROME});
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
        const callbacks = new Map(),
            listeners = new Map();
        let seq = 1;
        window.calls = [];
        const scientists = ['mad-scientist', 'heretic'].map((colleague) => ({
            id: colleague,
            colleague,
            target: {kind: 'lab-root'},
            mission: 'Navigation witness',
            state: 'idle',
            startedAt: new Date().toISOString(),
            lastStateChange: new Date().toISOString(),
        }));
        const signs = {
            lastChaos: {reportNumber: 118, label: 'The Holding', score: '7/10', raw: null},
            ideaLedger: {candidateCount: 4, shelvedCount: 12, mostRecentDelivered: '2026-09-16'},
        };
        const backlog = [
            {id: 'service', filed: '2026-10-10', source: '[Service handoff](documents/services.md)', item: '**Review the laboratory service watch** — inspect failure and recovery notices before the Windows walkthrough.', handler: 'investor'},
            {id: 'dependencies', filed: '2026-10-12', source: '[Dependency notes](documents/dependencies.md)', item: '**Prepare the Mezzanine dependency updates** — consolidate overlapping lockfile changes and run the local gates.', handler: 'mezzanine-scope'},
            {id: 'golem', filed: '2026-10-11', source: '[Parlour study](documents/golem.md)', item: '**Fit the chosen furnace worker into the Parlour** — preserve the room lighting and verify its seat.', handler: 'parlour-scope'},
        ];
        let planning = {items: backlog, priorities: backlog.slice(0, 2), revision: 'v1', backlogPath: '/laboratory/documents/lab-backlog.md'};
        const apps = ['Gatekeeper', 'War Table', 'Crucible', 'Parlour', 'Smokestacks', 'Horadrim'];
        const slugs = ['gatekeeper', 'war-table', 'crucible', 'parlour', 'smokestacks', 'horadrim'];
        const pings = () => apps.map((name, index) => ({slug: slugs[index], label: `The ${name}`, url: `https://${slugs[index]}.example.test/up`, healthy: !(window.fixtureFailure && index === 3), statusCode: window.fixtureFailure && index === 3 ? 503 : 200, responseTimeMs: 30 + index * 17, error: window.fixtureFailure && index === 3 ? 'HTTP 503' : ''}));
        const dependency = {repoFullName: 'Goosterhof/mezzanine', repoLabel: 'The Mezzanine', repoLocalPath: 'gadgets/mezzanine', experimentScope: 'mezzanine', number: 9001, title: 'Bump vue from 3.5.42 to 3.5.43', author: 'app/dependabot', headRef: 'dependabot/npm/vue', headOid: 'a'.repeat(40), isDraft: false, additions: 12, deletions: 12, changedFiles: 2, url: 'https://example.test/pull/9001'};
        window.emitTest = (event, payload) => {
            for (const id of listeners.get(event) || []) callbacks.get(id)({event, payload, id});
        };
        window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: () => {}};
        window.__TAURI_INTERNALS__ = {
            transformCallback: (fn) => {
                const id = seq++;
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
                    return {completedAt: '2026-09-16', labRoot: '/laboratory', claudeBinary: 'claude'};
                if (cmd === 'read_wizard_detected')
                    return {labRoot: '/laboratory', claudeBinary: 'claude', hostPlatform: 'windows'};
                if (cmd === 'list_roster' || cmd === 'list_recently_recalled' || cmd === 'list_briefing_templates')
                    return [];
                if (cmd === 'open_colleague') return scientists.find((s) => s.colleague === args.colleague);
                if (cmd === 'read_tube_connections')
                    return scientists.map((s) => ({
                        id: s.id,
                        identity: s.colleague,
                        delivery: s.colleague === 'heretic' ? 'queue' : 'channel',
                        error: null,
                    }));
                if (cmd === 'read_balcony_signs') return signs;
                if (cmd === 'read_planning') return planning;
                if (cmd === 'save_priorities') { if (args.expectedRevision !== planning.revision) throw new Error('Priorities changed. Refresh.'); planning = {...planning, priorities: args.ids.map(id => backlog.find(item => item.id === id)), revision: planning.revision + 'x'}; return planning; }
                if (cmd === 'read_service_health') return {experiments: pings()};
                if (cmd === 'list_open_prs') return {prs: [dependency], warnings: ['Synthetic unavailable repository — partial-view demonstration']};
                if (cmd === 'pull_request_files') return [{path: 'package.json', additions: 1, deletions: 1}];
                if (cmd === 'find_chaos_detonations') return [];
                if (cmd === 'read_merge_candidate') return {headOid: dependency.headOid, title: dependency.title, body: 'Updates Vue from 3.5.42 to 3.5.43.\n\nSYNTHETIC PR — no live merge is possible in this witness.', method: 'merge', ready: true, reason: 'Ready to merge this revision.', checks: [{name: 'ci-passed', state: 'SUCCESS', url: 'https://example.test/check'}]};
                if (cmd === 'merge_dependabot_pr') throw new Error('The PR changed. Refresh and inspect the new revision before merging.');
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
                if (cmd === 'read_inheritance_signals' || cmd === 'read_wounds_at_threshold' || cmd === 'list_open_prs')
                    return [];
                if (cmd === 'gh_auth_status') return {authenticated: true, message: ''};
                if (cmd === 'read_holotable_state') {
                    const {EMPTY_DASHBOARD} = await import('/src/holotable/types.ts');
                    return {...EMPTY_DASHBOARD, branch: 'main', experiments: pings().map(ping => ({...ping, id: `experiment-${ping.slug}`, kind: 'experiment', health: 'green', gitStatus: 'clean', detail: 'Synthetic app endpoint'}))};
                }
                return null;
            },
        };
    });
    await page.goto('http://127.0.0.1:1430/');
    await page.waitForSelector('[data-terminal="heretic"] .xterm');
    await page.evaluate(async () => {
        const {useScientistTerminals} = await import('/src/roster/useScientistTerminals.ts');
        const slots = ['mad-scientist', 'heretic'].map((id) => useScientistTerminals().get(id));
        window.witness = {slots, elements: slots.map((s) => s.terminal.element)};
        for (const id of ['mad-scientist', 'heretic'])
            window.emitTest('scientist-output', {
                scientist: id,
                chunk:
                    'SIMULATED OUTPUT — navigation witness\r\n' +
                    Array.from({length: 180}, (_, i) => `${id} conversation line ${i}`).join('\r\n') +
                    '\r\n',
            });
        await Promise.all(slots.map((s) => new Promise((r) => s.terminal.write('', r))));
        slots.forEach((s) => s.terminal.scrollToLine(20));
    });
    await page.locator('[data-command-input]').fill('Keep this unsent thought for the Heretic.');
    await page.locator('[data-terminal-pane="heretic"] > button').click();
    const initial = await page.evaluate(() =>
        window.witness.slots.map((s) => ({
            cols: s.terminal.cols,
            rows: s.terminal.rows,
            viewport: s.terminal.buffer.active.viewportY,
            first: s.terminal.buffer.active.getLine(0).translateToString(true),
        })),
    );
    await page.screenshot({path: artifact('mezzanine-conversation-page.png')});
    const routes = ['mission-control', 'drydock', 'holotable'];
    for (const route of routes) {
        await page.locator(`[data-page-link="${route}"]`).click();
        await page.waitForTimeout(150);
        assert.equal(await page.locator('[data-page="conversation"]').isVisible(), false);
        assert.equal(await page.locator(`[data-page="${route}"]`).isVisible(), true);
        if (route === 'mission-control') await page.screenshot({path: artifact('mezzanine-mission-page.png')});
    }
    const whileHidden = await page.evaluate(() =>
        window.witness.slots.map((s) => ({cols: s.terminal.cols, rows: s.terminal.rows})),
    );
    assert.deepEqual(
        whileHidden,
        initial.map(({cols, rows}) => ({cols, rows})),
    );
    await page.setViewportSize({width: 1080, height: 720});
    await page.evaluate(async () => {
        for (const id of ['mad-scientist', 'heretic'])
            window.emitTest('scientist-output', {scientist: id, chunk: 'ARRIVED WHILE ON ANOTHER PAGE\r\n'});
        await Promise.all(window.witness.slots.map((s) => new Promise((r) => s.terminal.write('', r))));
    });
    await page.waitForTimeout(150);
    const hiddenResize = await page.evaluate(() =>
        window.witness.slots.map((s) => ({cols: s.terminal.cols, rows: s.terminal.rows})),
    );
    assert.deepEqual(hiddenResize, whileHidden);
    await page.locator('[data-page-link="conversation"]').click();
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => ({
        sameElements: window.witness.slots.every(
            (s, i) => s.terminal.element === window.witness.elements[i] && s.terminal.element.isConnected,
        ),
        draft: document.querySelector('[data-command-input]').value,
        terminals: window.witness.slots.map((s) => ({
            cols: s.terminal.cols,
            rows: s.terminal.rows,
            viewport: s.terminal.buffer.active.viewportY,
            first: s.terminal.buffer.active.getLine(0).translateToString(true),
            received: Array.from({length: s.terminal.buffer.active.length}, (_, i) =>
                s.terminal.buffer.active.getLine(i)?.translateToString(true),
            ).some((l) => l.includes('ARRIVED WHILE')),
        })),
        opened: window.calls.filter((c) => c.cmd === 'open_colleague').length,
        recalls: window.calls.filter((c) => c.cmd === 'recall_scientist').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        terminalHeight: document.querySelector('[data-terminal]').getBoundingClientRect().height,
    }));
    assert.equal(result.sameElements, true);
    assert.equal(result.opened, 2);
    assert.equal(result.recalls, 0);
    assert.equal(result.overflow, false);
    assert.equal(result.draft, 'Keep this unsent thought for the Heretic.');
    result.terminals.forEach((t, i) => {
        assert.equal(t.received, true);
        assert.equal(t.first, initial[i].first);
        assert.equal(t.viewport, initial[i].viewport);
        assert.ok(t.cols > 2);
        assert.ok(t.rows > 1);
    });
    await page.screenshot({path: artifact('mezzanine-conversation-compact.png')});
    // Exercise the new actions against synthetic IPC, never real services or PRs.
    assert.equal(await page.locator('[data-page-link]').count(), 4);
    await page.setViewportSize({width: 1440, height: 900});
    await page.locator('[data-command-input]').fill('');
    await page.locator('[data-page-link="mission-control"]').click();
    await page.getByRole('button', {name: /Fit the chosen furnace worker/}).click();
    await page.getByRole('button', {name: 'Make a priority', exact: true}).click();
    await page.waitForFunction(() => document.querySelectorAll('.priority-row').length === 3);
    await page.screenshot({path: artifact('mezzanine-planning.png')});
    await page.getByRole('button', {name: 'Heretic', exact: true}).click();
    assert.match(await page.locator('[data-command-input]').inputValue(), /furnace worker/);
    assert.equal(await page.evaluate(() => window.calls.filter(c => c.cmd === 'write_to_scientist').length), 0);
    await page.locator('[data-command-input]').fill('');
    await page.evaluate(async () => {
        window.fixtureFailure = true;
        const {useServiceMonitor} = await import('/src/holotable/useServiceMonitor.ts');
        await useServiceMonitor().refresh(); await useServiceMonitor().refresh();
    });
    assert.match(await page.locator('[role="status"]').innerText(), /Parlour needs attention/);
    await page.locator('[data-page-link="holotable"]').click();
    await page.getByRole('button', {name: /The Parlour Unhealthy/}).click();
    await page.waitForTimeout(3000);
    assert.equal(await page.locator('[data-page="holotable"] canvas').evaluate(c => c.width > 0 && c.height > 0), true);
    await page.screenshot({path: artifact('mezzanine-services.png')});
    await page.locator('[data-page-link="drydock"]').click();
    await page.locator('[data-pr]').first().getByRole('button').first().click();
    await page.waitForSelector('[data-merge-dependency]');
    await page.screenshot({path: artifact('mezzanine-drydock.png')});
    await page.locator('[data-merge-dependency]').click();
    await page.waitForFunction(() => document.body.textContent.includes('The PR changed.'));
    assert.equal(await page.locator('[data-merge-dependency]').count(), 0);
    for (const size of [{width: 1080, height: 720}, {width: 1440, height: 900}]) {
        await page.setViewportSize(size);
        for (const route of routes) {
            await page.locator(`[data-page-link="${route}"]`).click();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
    }
    result.tabActions = 'priority save, prepared unsent brief, sustained service notice, refused changed-head merge, four-page layout';
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({initial, ...result, errors}, null, 2));
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
