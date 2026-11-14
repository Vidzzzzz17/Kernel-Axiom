# Kernel Axiom

A local-first AI assistant with a white interface and the original tan-square blue-bot logo. Chats and notes stay on-device. Model requests and approved app text go to your selected provider. API keys use Electron safeStorage on desktop and memory only in the browser.

## Run on Windows

Install Node.js 24 and Bun:

```powershell
bun install --frozen-lockfile
bun run dev
# In a second terminal:
bun run electron:dev
```

Complete onboarding, then open **PC setup** in the top bar:

1. Choose a model and enter your key if required. **Test connection** makes one small model request and verifies tool calling without executing an action. Save the model.
2. Choose a workspace folder for file tasks.
3. Click **Enable PC control** and accept the native session permission dialog.
4. Open Notepad, then ask: "Inspect Notepad and type Hello from Axiom." Approve each action and review its result.

The free model and Kernel AI need a working hosted backend and available provider quota; they are not bundled offline models. For local inference, select Ollama and an installed tool-capable model. Configure Ollama origins for `app://kernel` and `http://localhost:8080`. OpenAI-compatible endpoints are configurable. Demo mode cannot enable PC control.

## PC control

Windows Electron app only. The website cannot control your PC. Supported actions: inspect Windows accessibility labels and controls, click, type Unicode text, use keyboard shortcuts, and scroll. This is accessibility-based, not screenshot vision. Canvas apps and some browser content may not expose controls. The agent inspects again after each action to verify the result.

Each inspection/action asks for approval. Inspection sends visible app text to your model, potentially including sensitive text outside password fields. Password fields, elevated apps and Windows security prompts require manual interaction. Axiom briefly hides during approved inspection/input, then returns for the next approval.

**Stop PC**, the tray menu, or **Ctrl+Alt+Escape** revoke access and terminate the automation helper. Already-delivered input cannot be undone. Closing/reloading Axiom revokes access. If the emergency shortcut cannot register, PC control stays disabled.

Observations expire after two minutes and authorize one action. The native helper validates window identity, bounds and foreground focus. All arguments travel as JSON on stdin, never as interpolated PowerShell source. App content is untrusted data, not authorization.

File APIs validate workspace paths. **Shell commands are not sandboxed**: the workspace is their starting directory, not an OS security boundary. Review command approvals carefully.

## Build and verify

```powershell
bun run test:computer
bun run test
bunx tsc --noEmit
bunx tsc -p tsconfig.electron.json
bun run electron:build
```

The build prepares desktop icons from `src/assets/kernel-logo.png`, copies the native helper outside ASAR, builds the SPA, and creates an unsigned Windows x64 installer in `release/`. Windows may display a SmartScreen warning for unsigned builds.

**Desktop checks** in GitHub Actions uploads an installer artifact for pull requests and manual runs. A `v*` tag runs the release workflow and publishes installer/update files. The existing `/download` ZIP is an older build, not the new PC-control installer.

Desktop built-in API calls use a same-origin Electron proxy to `https://kernel-axiom.vercel.app`. Override `VITE_KERNEL_REMOTE_URL` at build time for another HTTPS backend. The proxy preserves streaming and cancellation without forwarding browser cookies or keys. The backend supplies its server-side gateway credentials; no secrets belong in this repository.

Before release, smoke-test the packaged app: onboarding, model connection, enable/cancel, Notepad inspection and Unicode typing, click/scroll, denied approval, stop while awaiting approval, emergency shortcut, reload, workspace selection, tray and title-bar controls.
