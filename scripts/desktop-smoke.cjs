// Runs against the packaged Windows app in CI. No model calls or desktop input.
const { _electron: electron } = require('../.smoke-tools/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const app = await electron.launch({
    executablePath: path.resolve('release/win-unpacked/Kernel Axiom.exe'),
    timeout: 60000,
  });
  let page;
  try {
    page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
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
    if (errors.length) throw new Error('Renderer errors: ' + errors.join('; '));
    console.log('Packaged desktop smoke test passed: onboarding, branding, IPC status, setup modal, model save, Escape and reload.');
  } catch (error) {
    fs.mkdirSync('release/smoke', { recursive: true });
    if (page) {
      console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 3000));
      await page.screenshot({ path: 'release/smoke/failure.png' }).catch(() => undefined);
    }
    throw error;
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
