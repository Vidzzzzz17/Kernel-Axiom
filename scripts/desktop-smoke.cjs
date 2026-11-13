// Runs against the packaged Windows app in CI; native input targets a disposable fixture.
const { _electron: electron } = require('../.smoke-tools/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

(async () => {
  const app = await electron.launch({
    executablePath: path.resolve('release/win-unpacked/Kernel Axiom.exe'),
    timeout: 60000,
  });
  let page;
  let fixture;
  try {
    page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()));
    await page.getByRole('button', { name: 'Get started', exact: true }).click();
    await page.getByRole('button', { name: 'Demo (simulated)', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('heading', { name: 'What should we work on?' }).waitFor();
    await page.getByRole('button', { name: 'PC setup', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Set up your assistant' });
    await modal.waitFor();
    if (!await modal.getByRole('button', { name: 'Enable PC control' }).isDisabled()) throw new Error('Demo mode must not enable PC control');
    await modal.getByRole('button', { name: 'Local (Ollama)', exact: true }).click();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await modal.getByText('Model saved.', { exact: true }).waitFor();
    if (!await modal.getByRole('button', { name: 'Enable PC control' }).isEnabled()) throw new Error('Desktop bridge is not available');
    fs.mkdirSync('release/smoke', { recursive: true });
    await page.screenshot({ path: 'release/smoke/pc-setup.png' });
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
    await page.reload();
    await page.getByRole('heading', { name: 'What should we work on?' }).waitFor();
    await page.getByRole('button', { name: 'PC setup', exact: true }).click();
    await page.getByRole('dialog', { name: 'Set up your assistant' }).waitFor();
    if (!await page.getByRole('button', { name: 'Local (Ollama)', exact: true }).getAttribute('aria-pressed').then(value => value === 'true')) throw new Error('Saved model was not restored');
    await page.keyboard.press('Escape');
    // Native permission is stubbed only in this isolated test process. Production
    // still shows the native dialog and the agent separately tests each approval.
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    fixture = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/desktop-fixture.ps1')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    fixture.stdout.on('data', data => console.log('Fixture:', data.toString()));
    fixture.stderr.on('data', data => console.error('Fixture:', data.toString()));
    fixture.on('error', error => console.error('Fixture process:', error));
    await new Promise(resolve => setTimeout(resolve, 3000));
    const enabled = await page.evaluate(() => window.kernel.computer.enable());
    if (!enabled.enabled) throw new Error('Native PC session did not enable');
    const act = action => page.evaluate(value => window.kernel.computer.execute(value), action);
    let listing, target;
    for (let attempt = 0; attempt < 5 && !target; attempt++) {
      listing = await act({ action: 'inspect' });
      target = listing.windows.find(window => window.title === 'Axiom Automation Fixture');
      if (!target) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!target) throw new Error('Fixture was not found by native inspection: ' + JSON.stringify({ exitCode: fixture.exitCode, listing }));
    const inspect = () => act({ action: 'inspect', windowId: target.windowId });
    let snapshot = await inspect();
    const button = snapshot.controls.find(control => control.name === 'Fixture click');
    if (!button) throw new Error('Native accessibility controls were not returned');
    await act({ action: 'click', snapshotId: snapshot.snapshotId, x: button.x, y: button.y, button: 'left', count: 1 });
    snapshot = await inspect();
    if (!snapshot.controls.some(control => control.name === 'Click verified')) throw new Error('Native click was not delivered');
    const input = snapshot.controls.find(control => control.name === 'Fixture input');
    if (!input) throw new Error('Fixture text field was not returned');
    await act({ action: 'click', snapshotId: snapshot.snapshotId, x: input.x, y: input.y, button: 'left', count: 1 });
    snapshot = await inspect();
    await act({ action: 'type', snapshotId: snapshot.snapshotId, text: 'Hello from Axiom' });
    snapshot = await inspect();
    if (!snapshot.controls.some(control => control.name === 'Hello from Axiom')) throw new Error('Native typing was not delivered');
    await act({ action: 'key', snapshotId: snapshot.snapshotId, keys: ['CTRL', 'A'] });
    snapshot = await inspect();
    await act({ action: 'type', snapshotId: snapshot.snapshotId, text: 'Unicode: नमस्ते' });
    snapshot = await inspect();
    if (!snapshot.controls.some(control => control.name === 'Unicode: नमस्ते')) throw new Error('Unicode typing or keyboard shortcut failed');
    await page.evaluate(() => window.kernel.computer.stop());
    let rejected = false;
    try { await act({ action: 'type', snapshotId: snapshot.snapshotId, text: 'Must not run' }); } catch { rejected = true; }
    if (!rejected) throw new Error('Input was allowed after stop');
    if (errors.length) throw new Error('Renderer errors: ' + errors.join('; '));
    console.log('Packaged desktop smoke test passed: onboarding, branding, setup, persistence, native inspection, clicking, typing, Unicode, shortcuts and stop.');
  } catch (error) {
    fs.mkdirSync('release/smoke', { recursive: true });
    if (page) {
      console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 3000));
      await page.screenshot({ path: 'release/smoke/failure.png' }).catch(() => undefined);
    }
    throw error;
  } finally { fixture?.kill(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
