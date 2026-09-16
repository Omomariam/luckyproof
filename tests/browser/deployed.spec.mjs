import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('workspace loads actual deployed testnet state without writing to chain', async ({page}) => {
  const record=JSON.parse(await readFile('deployments/botchain-testnet.json','utf8'));
  // A read-only test wallet adapter forwards RPC calls to the real testnet.
  // No private key, signatures, fabricated contract responses, or transactions.
  await page.exposeFunction('readTestnetRpc',async ({method,params=[]})=>{
    if(method==='eth_requestAccounts'||method==='eth_accounts')return [record.deployer];
    if(method==='eth_sendTransaction'||method.includes('sign'))throw new Error('Test is read-only');
    const response=await page.request.post(record.rpcUrl,{data:{jsonrpc:'2.0',id:1,method,params}});
    const body=await response.json();if(body.error)throw new Error(body.error.message);return body.result;
  });
  await page.addInitScript(()=>{window.ethereum={request:args=>window.readTestnetRpc(args),on(){},removeListener(){}};});
  await page.goto('/');await page.locator('[data-connect]').first().click();
  await expect(page.locator('#create-button')).toBeEnabled({timeout:30000});
  await expect(page.locator('#workspace-status')).toBeHidden();
  await expect(page.locator('#chain-status')).toBeHidden();
  await page.locator('#network-details summary').click();
  await expect(page.locator('#chain-status')).toBeVisible();
  await expect(page.locator('#chain-status a')).toHaveAttribute('href',new RegExp(record.address));
  await expect(page.locator('#total-stat')).toHaveText(/^\d[\d,]*$/);
  await expect(page.locator('#create-button')).toBeEnabled();
  const count=Number((await page.locator('#total-stat').textContent()).replaceAll(',',''));
  if(count) {
    await expect(page.locator('.draw-card')).toHaveCount(count);
    await page.locator('[data-open]').first().click();
    await expect(page.locator('#dialog')).toContainText('Winner selection isn’t available yet.');
  } else {
    await expect(page.locator('#draw-grid')).toContainText('There are no draws in this deployed contract yet');
  }
  await expect(page.locator('#chain-status')).not.toContainText('Winner selection');
});
