import { test, expect } from '@playwright/test';
test.beforeEach(async ({page}) => {
  // Keep unconfigured-state tests independent of the actual live deployment.
  await page.route('**/api/config', route => route.fulfill({json:{contractAddress:'',deploymentBlock:0,chainId:968,chainName:'BOT Chain Testnet',rpcUrl:'https://rpc.bohr.life',explorerUrl:'https://scan.bohr.life'}}));
});

// Wallet doubles live only in tests; no fixture data or wallet fallback ships in the app.
async function installTestWallet(page, { reject = false } = {}) {
  await page.addInitScript(({ reject }) => {
    const listeners = new Map();
    window.ethereum = {
      request: async ({method}) => {
        if(method==='eth_requestAccounts' && reject) throw Object.assign(new Error('Declined'), {code:4001});
        if(['eth_requestAccounts','eth_accounts'].includes(method)) return ['0x'+'1'.repeat(40)];
        if(method==='eth_chainId') return '0x3c8';
        if(method==='wallet_revokePermissions') return null;
        throw new Error('Unexpected test RPC: '+method);
      },
      on: (event, listener) => listeners.set(event, listener),
      removeListener: event => listeners.delete(event)
    };
    window.emitWalletEvent = (event, value) => listeners.get(event)?.(value);
  }, { reject });
}
test('landing is public; all protected deep links redirect without a wallet', async ({page}) => {
  for(const route of ['overview','draws','history','verify']) {
    await page.goto('/#/app/'+route);
    await expect(page.locator('#landing')).toBeVisible();
    await expect(page.locator('#workspace-app')).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);
  }
  await expect(page.locator('[data-connect]').first()).toBeVisible();
  const favicon = await page.request.get('/favicon.svg'); expect(favicon.ok()).toBeTruthy();
});
test('wallet unavailable or declined never unlocks the workspace', async ({page}) => {
  await page.goto('/'); await page.locator('[data-connect]').first().click();
  await expect(page.locator('#connect-status')).toContainText('No EVM wallet detected');
  await installTestWallet(page, {reject:true}); await page.reload();
  await page.locator('[data-connect]').first().click();
  await expect(page.locator('#connect-status')).toHaveText('Wallet request declined.');
  await expect(page.locator('#workspace-app')).toBeHidden();
});
test('connection shows real account and unconfigured state; disconnect locks navigation', async ({page}) => {
  await installTestWallet(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('luckyproof.draws.v1', JSON.stringify([{title:'Retired demo'}])));
  await page.reload();
  await page.locator('[data-connect]').first().click();
  await expect(page.locator('#workspace-app')).toBeVisible();
  await expect(page.locator('#wallet-address')).toHaveAttribute('title','0x'+'1'.repeat(40));
  await expect(page.locator('#chain-status')).toContainText('contract is not configured');
  await expect(page.locator('#total-stat')).toHaveText('—');
  await expect(page.locator('#create-button')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('luckyproof.draws.v1'))).toBeNull();
  await page.locator('[data-page="history"]').click();
  await expect(page.locator('#page-title')).toContainText('Draw history');
  await page.locator('header [data-disconnect]').click();
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.locator('#workspace-app')).toBeHidden();
  await page.evaluate(() => location.hash='#/app/history');
  await expect(page).toHaveURL(/#\/$/);
});
test('wallet account removal clears access immediately', async ({page}) => {
  await installTestWallet(page); await page.goto('/'); await page.locator('[data-connect]').first().click();
  await expect(page.locator('#workspace-app')).toBeVisible();
  await page.evaluate(() => window.emitWalletEvent('accountsChanged', []));
  await expect(page.locator('#workspace-app')).toBeHidden();
  await expect(page.locator('#landing')).toBeVisible();
});
test('landing and disconnect control fit mobile screens', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await installTestWallet(page); await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-connect]').first().click();
  await expect(page.locator('header [data-disconnect]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
