<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Kernel Axiom is single-user and local-first: data lives in IndexedDB via Dexie (`src/lib/kernel/db.ts`); no Lovable Cloud, no accounts. Why: the user wants no login and all data on-device.
- All agent work goes through `runAgent()` (`src/lib/kernel/agent.ts`) and model calls through `src/lib/kernel/modelClient.ts` (OpenAI-compatible, user-supplied key, called from the client). Why: providers must be swappable without UI changes.
- Risky tools (file writes, code runs, sending data) must call `requestApproval` before executing. Why: approval-first is a core product promise.
- API keys go only through `secrets` in `src/lib/kernel/bridge.ts` (Electron safeStorage, else memory); never localStorage/IndexedDB. Why: keys must not be stored in plain text.
- Electron lives in `electron/`, bundled by `scripts/electron.mjs`; the desktop build sets `KERNEL_ELECTRON=1` to emit an SPA shell served via the `app://` protocol. Why: keeps the desktop build isolated from the web deploy.
- Orb visuals are pure CSS in `src/styles.css` (`.orb[data-state]`); states change only eyes/posture. Why: brand rule.
