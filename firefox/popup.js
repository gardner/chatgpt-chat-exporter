'use strict';

const buttons = Array.from(document.querySelectorAll('[data-format]'));
const status = document.getElementById('status');

buttons.forEach(button => button.addEventListener('click', async () => {
    buttons.forEach(item => { item.disabled = true; });
    status.textContent = 'Exporting… Keep the conversation tab in the foreground.';
    try {
        const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        const url = new URL(tab?.url || 'about:blank');
        if (url.protocol !== 'https:' || !['chatgpt.com', 'chat.openai.com', 'chat.com'].includes(url.hostname)) {
            throw new Error('Open a ChatGPT conversation before exporting.');
        }
        // Inject packaged code only. MAIN uses the page's authenticated fetch,
        // matching the reviewed console/user-script implementation.
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            files: ['chatgpt-exporter.js']
        });
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: format => {
                // Export continues in the tab even when the popup is closed.
                // No conversation contents or token cross into the popup.
                globalThis.ChatExporter[format === 'pdf' ? 'pdf' : 'markdown']();
            },
            args: [button.dataset.format]
        });
        status.textContent = 'Export started. You can close this menu; progress appears in the conversation.';
    } catch (error) {
        status.textContent = error.message || 'Export could not start. Reload the conversation and try again.';
    } finally {
        buttons.forEach(item => { item.disabled = false; });
    }
}));
