const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'dist', 'firefox-extension');
const { version } = require('../package.json');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'firefox', 'manifest.json'), 'utf8'));
manifest.version = version;
const bundle = ['extraction-engine.js', 'progress-overlay.js', 'userscript-ui.js']
    .map(file => fs.readFileSync(path.join(root, 'src', file), 'utf8').trim()).join('\n\n') + `
globalThis.ChatExporterUi.install({
    engine: globalThis.ChatExporterEngine,
    progress: globalThis.ChatExporterProgress
});
`;
fs.mkdirSync(destination, { recursive: true });
for (const file of ['popup.html', 'popup.css', 'popup.js']) {
    fs.copyFileSync(path.join(root, 'firefox', file), path.join(destination, file));
}
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(destination, 'LICENSE'));
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(destination, 'chatgpt-exporter.js'), bundle);
console.log(`Built Firefox extension ${version} in ${destination}`);
