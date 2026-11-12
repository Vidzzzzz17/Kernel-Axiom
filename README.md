# Kernel Axiom

A calm, local-first AI agent. No accounts — tasks, chats, memory and settings are stored on your device (IndexedDB). Export/import everything as JSON from Settings → Data.

## Run in development

```bash
bun install
bun run dev            # web app at http://localhost:8080
bun run electron:dev   # in a second terminal: desktop window pointing at the dev server
```

## Build the Windows installer

```bash
bun run electron:build
```

This builds the web app as a static shell, bundles `electron/main.ts` + `electron/preload.ts`, and runs electron-builder (NSIS, x64). The installer lands in `release/`.

Pushing a tag like `v0.1.0` runs `.github/workflows/release.yml` on `windows-latest` and attaches the installer to a GitHub Release. Set `owner`/`repo` in `electron-builder.yml` so auto-update (electron-updater) can find releases.

> The installer is unsigned. Windows SmartScreen will warn ("Windows protected your PC") until you code-sign it with a certificate.

## Models

Settings → Model: Demo (simulated), OpenAI-compatible (base URL, key, model), OpenRouter, Together, or Local (Ollama at `http://localhost:11434`). For Ollama in the browser, start it with `OLLAMA_ORIGINS=*` so the app can reach it.

API keys are encrypted with the OS keychain (Electron `safeStorage`) in the desktop app. In a browser tab they are kept in memory only and must be re-entered after reload.

## Desktop features

Frameless glass title bar, remembers size/position, tray icon (Open / Quit; closing hides to tray), `Ctrl+Space` to show/hide and focus the command bar, single instance, external links open in your browser. File and code tools run only inside a workspace folder you choose, and always ask first.

## Conversation and computer controls

Use the model button in the chat header to open model settings. Select a real
provider (built-in Kernel AI, OpenAI-compatible, OpenRouter, Together or local
Ollama); Demo only simulates work. Keys stay in the existing secrets bridge.

- Chat: conversational answers without tools.
- Research: web search and reading with sources, without computer changes.
- Computer: workspace tools and Windows accessibility controls.

In the updated Windows app, try "List my open windows", then ask to inspect or
operate one. Kernel can launch Notepad, Calculator and File Explorer, invoke
accessible buttons, replace editable field values, and send supported shortcuts.
Visible app text is shared with your selected model only after approval.
Password controls are excluded; native action confirmation protects mutations.
Custom canvases and controls without Invoke/Value accessibility patterns are
unsupported. This is accessibility automation, not screenshot-based mouse control.
The browser version cannot control Windows apps.

Shell commands start in the chosen workspace but are NOT sandboxed: approved
commands can access other files and the network. Stop prevents subsequent tools;
already running native actions or commands may finish. Desktop actions time out
after 15 seconds. The original white interface is retained, with model selection and Computer mode. This is not an xAI service integration.

Packaged desktop builds using built-in API routes need VITE_KERNEL_REMOTE_URL
set to the deployed web origin at build time. Local Ollama chat/computer tools
can work without that bridge (web research still needs it).

Validate with Node 22.18+: `node --test scripts/computer.test.mjs`.
Also run the existing tests, web build and Electron compile before distribution.
