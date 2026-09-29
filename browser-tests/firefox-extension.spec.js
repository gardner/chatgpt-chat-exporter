const { test, expect, firefox } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '..');

async function freePort() {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

test('installed Firefox extension exports through its launcher and toolbar menu', async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'firefox', 'Firefox-specific extension installation');
    const { connectWithMaxRetries } = await import('../node_modules/web-ext/lib/firefox/remote.js');
    const port = await freePort();
    const browser = await firefox.launch({
        headless: true,
        args: ['-start-debugger-server', String(port)],
        firefoxUserPrefs: {
            'devtools.debugger.remote-enabled': true,
            'devtools.debugger.prompt-connection': false,
            'devtools.chrome.enabled': true
        }
    });
    let remote;
    try {
        remote = await connectWithMaxRetries({ port, maxRetries: 50, retryInterval: 100 });
        await remote.installTemporaryAddon(path.join(root, 'dist', 'firefox-extension'));
        const addon = await remote.getInstalledAddon('chatgpt-chat-exporter@gardner.github.io');
        expect(addon.warnings).toEqual([]);
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const calls = [];
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            calls.push(url.href);
            if (url.pathname === '/api/auth/session') {
                return route.fulfill({ json: { accessToken: 'fixture-only-token' } });
            }
            if (url.pathname === '/backend-api/conversation/extension-fixture') {
                return route.fulfill({ json: {
                    title: 'Extension fixture', current_node: 'a', mapping: {
                        u: { parent: null, children: ['a'], message: { id: 'u', author: { role: 'user' },
                            content: { content_type: 'text', parts: ['Extension prompt'] }, metadata: {} } },
                        a: { parent: 'u', children: [], message: { id: 'a', author: { role: 'assistant' },
                            content: { content_type: 'text', parts: ['Extension answer'] }, metadata: {} } }
                    }
                } });
            }
            if (route.request().isNavigationRequest()) {
                return route.fulfill({ contentType: 'text/html', headers: {
                    'content-security-policy': "script-src 'none'; object-src 'none'"
                }, body: `<!doctype html><title>Extension fixture</title><main>
                    <div data-message-author-role="user" data-message-id="u"><p>Extension prompt</p></div>
                    <div data-message-author-role="assistant" data-message-id="a"><p>Extension answer</p></div>
                    </main>` });
            }
            return route.fulfill({ status: 404, body: '' });
        });
        await page.goto('https://chatgpt.com/c/extension-fixture');
        // No script tags or addScriptTag calls: Firefox loads the real add-on.
        await expect(page.locator('#chat-exporter-launcher')).toBeVisible();
        await page.locator('#chat-exporter-launcher').click();
        const downloading = page.waitForEvent('download');
        await page.getByText('Export to Markdown', { exact: true }).click();
        const download = await downloading;
        expect(await download.failure()).toBeNull();
        const markdown = await fs.readFile(await download.path(), 'utf8');
        expect(markdown).toContain('Extension prompt');
        expect(markdown).toContain('Extension answer');
        expect(markdown).not.toContain('fixture-only-token');
        expect(calls).toContain('https://chatgpt.com/api/auth/session');

        // Playwright cannot inspect privileged moz-extension pages. Use
        // Firefox's extension debugger to load and click the packaged popup.
        const targets = [];
        const handlePacket = remote.client._handleMessage.bind(remote.client);
        remote.client._handleMessage = packet => {
            if (['evaluationResult', 'target-available-form', 'target-destroyed-form'].includes(packet.type)) {
                if (packet.type === 'target-available-form') targets.push(packet.target);
                remote.client.emit('extension-test-packet', packet);
            } else {
                handlePacket(packet);
            }
        };
        const watcher = await remote.client.request({ to: addon.actor, type: 'getWatcher' });
        await remote.client.request({ to: watcher.actor, type: 'watchTargets', targetType: 'frame' });
        await expect.poll(() => targets.length).toBeGreaterThan(0);
        const popupUrl = new URL('popup.html', addon.manifestURL).href;
        await remote.client.request({ to: targets[0].actor, type: 'navigateTo', url: popupUrl });
        await expect.poll(() => targets.some(target => target.url === popupUrl)).toBe(true);
        const popupTarget = targets.find(target => target.url === popupUrl);
        const evaluatePopup = async text => {
            const response = new Promise((resolve, reject) => {
                const listener = packet => {
                    if (packet.type !== 'evaluationResult' || packet.from !== popupTarget.consoleActor) return;
                    remote.client.off('extension-test-packet', listener);
                    if (packet.hasException) reject(new Error(packet.exceptionMessage));
                    else resolve(packet.result);
                };
                remote.client.on('extension-test-packet', listener);
            });
            await remote.client.request({ to: popupTarget.consoleActor, type: 'evaluateJSAsync', text });
            return response;
        };
        await expect.poll(() => evaluatePopup('document.readyState')).toBe('complete');
        await page.bringToFront();
        const pdfDownloading = page.waitForEvent('download');
        pdfDownloading.catch(() => {}); // Preserve assertion failures during browser cleanup.
        await evaluatePopup('document.querySelector("[data-format=pdf]").click()');
        await expect.poll(() => evaluatePopup('document.getElementById("status").textContent')).toContain('Export started');
        const pdf = await pdfDownloading;
        expect(pdf.suggestedFilename()).toMatch(/PrintToPDF\.html$/);
        expect(await fs.readFile(await pdf.path(), 'utf8')).toContain('Extension answer');
        expect(errors).toEqual([]);
        expect(calls.every(url => new URL(url).hostname === 'chatgpt.com')).toBe(true);
    } finally {
        remote?.disconnect();
        await browser.close();
    }
});
