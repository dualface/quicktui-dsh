# Repository Guidelines

## Scope

This file covers only the npm package `quicktui-dsh`: the bundle plugin for DeepSeek Harness (dsh). Users install it by package name on the dsh **Plugins** page.

- `lib/index.js`: host entry. Combines server detection, the setup page routes, and the bridge. The bridge is on by default (config `bridge: false` turns it off).
- `lib/bridge.js`: the AgentBridge2 bridge. The wire protocol is in [PROTOCOL.md](PROTOCOL.md); `ab2hook --agent dsh` of `agentbridge2` consumes it.
- `lib/setup.js`: detects, installs, starts, and pairs `quicktui-server`. `lib/routes.js`: the `/api/quicktui-dsh/*` routes the setup page calls.
- `lib/owner.js`: the `owner.pid` owner lock. Decides which dsh process runs the startup backfill and waits for commands.
- `lib/client.js`: browser side. A hand-written classic script, registered through `window.__ModuleLoader__.load`, with no build step.
- `lib/vendor/qrcode.cjs`: `qrcode-generator` (MIT), vendored as is. Replace the whole file only; never edit its content.
- `README.md` / `README.zh.md`: the dsh plugin detail page (the Chinese one is selected through `meta.detail` in `locale/zh.json`).
- `CHANGELOG.md`: one section per npm version. `LICENSE`: MIT. `scripts/sync-public-repo.sh`: syncs this directory to the public repository (see "Publishing").

## Language (hard rule)

This directory is mirrored to the public repository `github.com/dualface/quicktui-dsh`, so it uses English. This overrides the commit message language in the root `AGENTS.md` for this directory.

- Code comments are in English.
- Every commit that changes this directory has an English commit message, including a commit that also changes other directories. Prefer to keep changes to this directory in commits of their own.
- Documents are in English. The only exception is the README: `README.md` (English) and `README.zh.md` (Chinese) are two versions of the same content, kept in sync.
- User-facing product text is not a document: the `en` / `zh` dictionaries in `lib/client.js` and `locale/*.json` keep both languages.
- Earlier commits with Chinese messages are not rewritten.

## Editing Rules

- The package has no runtime dependencies. The browser side may only `require` dsh shared modules (`react`, `@deepseek-ai/dsh-client-ui-primitives`, and so on; the source of truth is `packages/client/web/src/platform.ts` in deepseek-harness).
- Always run `quicktui-server` with an absolute path and an argv array, never through a shell. Installation only runs the official `q.sh` (`https://quicktui.ai/q.sh` or `https://dl.quicktui.cn/q.sh`), and only after the user confirms on the setup page.
- Pairing text and pairing codes go only to the setup page. Never write them to logs or files.
- When setup page copy changes, keep the `en` and `zh` dictionaries in `lib/client.js` in sync. When the detail page changes, keep `README.md` and `README.zh.md` in sync.
- A change to the wire protocol (`PROTOCOL.md`) must match the dsh consumer in `agentbridge2`.

## Verification

- `npm test` (Node 22+, runs directly on the host; no Docker). When a change only touches `lib/client.js`, run at least `node --check lib/client.js`.
- Before publishing, build a tarball with `npm pack` and install it in dsh Desktop with `dsh plugin --profile desktop add <tgz>` to verify it (quit dsh first).

## Publishing

The npm package `quicktui-dsh` (unscoped) is published from the user's personal npm account. dsh installs it by package name through pnpm, looking at `registry.npmjs.org` first, then `registry.npmmirror.com`. The source is synced to the public repository `github.com/dualface/quicktui-dsh`, which the npm `repository` field and the awesome-dsh-plugin entry point to. The public repository is a one-way mirror: never commit to it directly, and port outside contributions into this directory. Its pull requests are disabled.

- **Publishing order (hard rule)**: the bridge is on by default, so publish the plugin only after a stable server release contains the dsh provider. An older server rejects `ab2hook --agent dsh`, and the plugin keeps restarting and waiting.
- **Publishing source**: publish commits on `origin/main`. Version number and `CHANGELOG.md` changes enter `develop` as ordinary tasks first, then `main` through promotion.
- **Confirm every outward action (hard rule)**: before each of the steps below, ask the user for a numbered confirmation (`1. Confirm`; `2. Stop`), and never skip one because an earlier step was confirmed: creating the public repository, pushing with `scripts/sync-public-repo.sh`, `npm publish`, and opening a PR to awesome-dsh-plugin.

Steps:

1. Check: `npm test` passes; `version` in `package.json` matches the latest section of `CHANGELOG.md`; `engines.dsh` covers the `latest` of `@deepseek-ai/dsh` on npm; the tarball is verified in dsh Desktop as in "Verification".
2. Sync the public repository: `integrations/quicktui-dsh/scripts/sync-public-repo.sh origin/main <version>` pushes `main` and the tag `v<version>`. It appends the new commits to the public `main`, so the push is a fast-forward. When the tree of the public `main` is not on the first-parent history of `origin/main`, it stops without pushing; never force-push the public repository to get past this.
3. Publish to npm: the user runs `npm login` on this machine first; run `npm publish` in this directory of a clean checkout of `origin/main`. Afterwards `npm view quicktui-dsh version` and `https://registry.npmmirror.com/quicktui-dsh` both return the new version.
4. After the first release, list the plugin in awesome-dsh-plugin (later versions do not need this): add `data/plugins/dualface__quicktui-dsh.yml` (`category: remote`) as that repository's `contributing.md` describes; the public repository has the `dsh-plugin` topic and has existed for more than one day; the entry's `icon` accepts only png / jpg / webp files on GitHub.
