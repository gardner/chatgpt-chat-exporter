# Firefox extension

The Firefox add-on exports ChatGPT conversations using the same engine as the
console scripts. It requires Firefox 140 or later. The toolbar menu offers
Markdown and print-ready HTML; open the latter and use Print / Save as PDF.
The existing in-page export menus and floating launcher are also available.

The extension requests access only to ChatGPT's three supported domains and
the scripting API. It reads the provider session and conversation on export,
does not send chats or credentials to a project server, and has no remote-code
loader or upstream userscript update mechanism. Remote image fallbacks retain
the privacy implications described in SECURITY.md.

## Build and temporary development installation

```sh
npm ci --ignore-scripts
npm run build:firefox
npm run lint:firefox
npm run package:firefox
```

Unsigned packages are for development only. Open `about:debugging`, select
**This Firefox**, click **Load Temporary Add-on**, and select
`dist/firefox-extension/manifest.json`. The installation ends when Firefox
restarts. Reload existing ChatGPT tabs after installation.

## Permanent installation and GitHub distribution

Standard Firefox's **Install Add-on From File** requires a Mozilla-signed XPI.
A GitHub Release does not replace signing. Use Mozilla's **unlisted** signing
channel to distribute privately or through GitHub without a marketplace listing.

Configure `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` locally, then run:

```sh
npm run sign:firefox
```

Publish the signed `.xpi` from `dist/firefox-signed/`, along with its SHA256
checksum. Do not publish the unsigned development ZIP as a permanently
installable add-on. Keep API secrets out of source control and release files.

Signing documentation: https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/#sign-your-extension-for-self-distribution

## GitHub Actions

In the repository's **Settings → Secrets and variables → Actions**, create
repository secrets `AMO_JWT_ISSUER` (Mozilla's JWT issuer) and `AMO_JWT_SECRET`
(Mozilla's JWT secret). Then run **Actions → Signed Firefox release → Run
workflow** on the default branch.

Pushing a tag named `firefox-v<version>` also starts the workflow. The tag must
match the version in `package.json`.

The workflow builds and tests the add-on, runs Mozilla's validator, signs through
the unlisted channel, checks that an XPI with signing metadata was returned, and
publishes `firefox-v<version>` with the signed XPI and `SHA256SUMS`. Its built-in
GitHub token publishes the release; a personal GitHub token is not required.
Signing secrets are scoped to the credential-check and signing steps and are
never passed on the command line. Bump the package version for each new signing
submission; Mozilla does not allow the same version to be submitted twice.
