// Browser witness for the isolated study and the actual terminal-link integration.
// PLAYWRIGHT_MODULE can name an existing installation of playwright-core.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const artifacts = process.env.CHAT_ARTIFACTS || '/tmp/mezzanine-heretic-chat';
await mkdir(artifacts, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: process.env.CHAT_CHROME});
const context = await browser.newContext({
    viewport: {width: 1440, height: 1000},
    permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
try {
    await page.goto('http://127.0.0.1:1430/studies/heretic-chat/');
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('heading', {name: 'Give the words room to breathe.'}).waitFor();
    await page.screenshot({path: path.join(artifacts, 'graphite.png')});
    await page.getByRole('button', {name: 'Pin reply'}).click();
    await page.getByRole('button', {name: 'Margin 1'}).click();
    assert.equal(await page.getByRole('button', {name: /01 · Give the words/}).count(), 1);
    await page.getByRole('button', {name: /01 · Give the words/}).click();
    await page.getByRole('button', {name: 'Close margin'}).click();
    checks.push('Pin and revisit a reply');
    await page.getByRole('button', {name: 'Copy code', exact: true}).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /await openUrl\(/);
    await page.locator('.code-block').scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join(artifacts, 'code-and-references.png')});
    checks.push('Code copied to the browser clipboard');
    const links = await page
        .locator('.reply a')
        .evaluateAll((anchors) => anchors.map((a) => ({url: a.href, rel: a.rel, target: a.target})));
    assert.equal(links.length, 2);
    assert.ok(
        links.every(
            (link) => link.url.startsWith('https://') && link.rel.includes('noopener') && link.target === '_blank',
        ),
    );
    checks.push('References have real HTTPS destinations and separate-window links');
    await page.getByRole('button', {name: 'At work', exact: true}).click();
    assert.equal(await page.locator('details').getAttribute('open'), '');
    await page.getByRole('heading', {name: 'Following the thread.'}).waitFor();
    await page.getByRole('button', {name: 'A question', exact: true}).click();
    await page.getByRole('button', {name: /Replies first/}).click();
    assert.match(await page.getByRole('status').innerText(), /selected for this preview/);
    checks.push('Working and question states, local choice feedback');
    await page.getByRole('button', {name: 'A reply', exact: true}).click();
    await page.getByRole('button', {name: 'Paper', exact: true}).click();
    await page.locator('.reader').evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({path: path.join(artifacts, 'paper.png')});
    await page.getByRole('button', {name: 'Latest ↓'}).click();
    assert.ok(
        await page.locator('.reader').evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2),
    );
    checks.push('Latest returns to the bottom of the reading pane');
    await page.getByRole('button', {name: 'Graphite', exact: true}).click();
    await page.setViewportSize({width: 1080, height: 720});
    await page.locator('.reader').evaluate((el) => (el.scrollTop = 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.colleague:visible').count(), 2);
    await page.screenshot({path: path.join(artifacts, 'compact-window.png')});
    await page.emulateMedia({reducedMotion: 'reduce'});
    assert.equal(
        await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length),
        0,
    );
    checks.push('Both colleagues visible at 1080×720; no document overflow or running animations under reduced motion');

    // Render real xterm slots over the study, with only the Tauri IPC boundary simulated.
    await page.evaluate(async () => {
        window.openCalls = [];
        window.__TAURI_INTERNALS__ = {
            invoke: async (command, args) => {
                window.openCalls.push({command, args});
            },
        };
        await import('/node_modules/@xterm/xterm/css/xterm.css');
        const {useScientistTerminals} = await import('/src/roster/useScientistTerminals.ts');
        const host = document.createElement('div');
        host.id = 'terminal-witness';
        host.style.cssText = 'position:fixed;inset:0;z-index:10;background:#0b0d10;padding:20px';
        document.body.append(host);
        window.slot = useScientistTerminals().get('link-witness');
        window.slot.terminal.open(host);
        window.slot.terminal.resize(48, 20);
        await new Promise((resolve) =>
            window.slot.terminal.write(
                'https://example.com/plain\r\n' +
                    '\x1b]8;;https://example.com/explicit\x07Named reference\x1b]8;;\x07\r\n' +
                    'https://example.com/a/very/long/reference/that/wraps?part=two\r\n',
                resolve,
            ),
        );
    });
    async function terminalPoint(row, col) {
        return page.evaluate(
            ({row, col}) => {
                const rect = window.slot.terminal.element.querySelector('.xterm-screen').getBoundingClientRect();
                return {
                    x: rect.x + (rect.width / window.slot.terminal.cols) * (col + 0.5),
                    y: rect.y + (rect.height / window.slot.terminal.rows) * (row + 0.5),
                };
            },
            {row, col},
        );
    }
    async function clickCell(row, col, ctrl = true) {
        const point = await terminalPoint(row, col);
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(200);
        if (ctrl) await page.keyboard.down('Control');
        await page.mouse.click(point.x, point.y);
        if (ctrl) await page.keyboard.up('Control');
    }
    await clickCell(0, 8, false);
    assert.equal(await page.evaluate(() => window.openCalls.length), 0);
    await clickCell(0, 8);
    await clickCell(1, 5);
    await clickCell(3, 4);
    const opened = await page.evaluate(() => window.openCalls);
    assert.deepEqual(
        opened.map((call) => [call.command, call.args.url]),
        [
            ['plugin:opener|open_url', 'https://example.com/plain'],
            ['plugin:opener|open_url', 'https://example.com/explicit'],
            ['plugin:opener|open_url', 'https://example.com/a/very/long/reference/that/wraps?part=two'],
        ],
    );
    checks.push('Real xterm plain, named OSC 8, and wrapped URLs reach the Tauri opener; plain click does not open');
    assert.deepEqual(errors, []);
    await writeFile(
        path.join(artifacts, 'receipt.json'),
        JSON.stringify(
            {
                checks,
                errors,
                opened,
                boundary: 'Chromium, simulated Tauri opener; no native Windows validation or live Codex session',
            },
            null,
            2,
        ),
    );
    console.log(JSON.stringify({checks, errors, artifacts}, null, 2));
} finally {
    await browser.close();
}
