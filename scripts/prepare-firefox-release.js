const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
async function prepareFirefoxRelease({
    signed = path.join(root, 'dist', 'firefox-signed'),
    destination = path.join(root, 'dist', 'firefox-release')
} = {}) {
    const candidates = fs.readdirSync(signed).filter(file => file.endsWith('.xpi'));
    if (candidates.length !== 1) throw new Error('Expected exactly one Mozilla-signed XPI.');
    const file = path.join(signed, candidates[0]);
    // Reject the unsigned ZIP even if it was renamed to .xpi. Mozilla's
    // cryptographic signature is verified by Firefox when the user installs.
    const { entries, manifest } = await new Promise((resolve, reject) => {
        yauzl.open(file, { lazyEntries: true }, (error, zip) => {
            if (error) return reject(error);
            const names = [];
            let manifest;
            zip.on('error', reject);
            zip.on('entry', entry => {
                names.push(entry.fileName);
                if (entry.fileName !== 'manifest.json') return zip.readEntry();
                zip.openReadStream(entry, (error, stream) => {
                    if (error) return reject(error);
                    const chunks = [];
                    stream.on('error', reject);
                    stream.on('data', chunk => chunks.push(chunk));
                    stream.on('end', () => {
                        try { manifest = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
                        catch (error) { zip.close(); return reject(error); }
                        zip.readEntry();
                    });
                });
            });
            zip.on('end', () => resolve({ entries: names, manifest }));
            zip.readEntry();
        });
    });
    if (!entries.includes('manifest.json') ||
        !entries.some(name => /^META-INF\/(?:mozilla\.rsa|cose\.sig)$/i.test(name))) {
        throw new Error('XPI has no Mozilla signing metadata; refusing to publish an unsigned add-on.');
    }
    const expected = require('../firefox/manifest.json');
    if (manifest.version !== version ||
        manifest.browser_specific_settings?.gecko?.id !== expected.browser_specific_settings.gecko.id) {
        throw new Error('Signed XPI identity or version does not match this release.');
    }
    fs.mkdirSync(destination, { recursive: true });
    const name = `chatgpt-chat-exporter-firefox-v${version}.xpi`;
    const bytes = fs.readFileSync(file);
    fs.writeFileSync(path.join(destination, name), bytes);
    fs.writeFileSync(path.join(destination, 'SHA256SUMS'),
        `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
    console.log(`Prepared signed Firefox release in ${destination}`);
}

module.exports = { prepareFirefoxRelease };
if (require.main === module) {
    prepareFirefoxRelease().catch(error => { console.error(error.message); process.exitCode = 1; });
}
