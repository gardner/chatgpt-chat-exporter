Install the Mozilla-signed `.xpi` asset in Firefox using **Add-ons and themes →
Extensions → gear menu → Install Add-on From File**. Requires Firefox 140 or later.

Open a ChatGPT conversation and use the extension toolbar menu or the in-page
Export menu. Markdown exports download as `.md`; PDF exports download a
print-ready HTML file. Open that file and choose **Print → Save as PDF**.

This extension is signed through Mozilla's unlisted channel and is not listed
in the Firefox marketplace. It has no userscript-manager dependency or remote
code loader. The `SHA256SUMS` asset contains the signed XPI's SHA256 checksum.

The extension reads the current conversation and authenticated provider data
to produce a local download. It has no analytics or project-operated upload
endpoint. Images that cannot be embedded can retain their original remote URLs;
opening the export can contact those hosts.
