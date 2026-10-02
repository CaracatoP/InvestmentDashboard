/* Isolated UX smoke checks. All /api requests are mocked; this does not validate the backend. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const output = process.env.UX_QA_OUTPUT || path.join(require('node:os').tmpdir(), 'investment-ux-qa');
fs.mkdirSync(output, { recursive: true });
const baseURL = process.env.UX_QA_URL || 'http://localhost:5173';
const results = [];
async function run() {
  const browser = await playwright.chromium.launch({ channel: process.env.UX_QA_CHANNEL || 'msedge', headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      let failRefresh = true;
      let failDashboard = true;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        let data = [];
        if (pathname.endsWith('/auth/me')) data = { user: { id: 'qa-only', name: 'Pessoa de teste', email: 'qa@example.test' } };
        else if (pathname.endsWith('/settings')) data = { profile: { name: 'Pessoa de teste', currency: 'BRL', theme: 'dark' }, allocations: [] };
        else if (pathname.endsWith('/assets')) data = [{ id: 'qa-asset', name: 'Ativo de teste', ticker: 'TEST11', category: 'FII', currency: 'BRL', sector: 'Logística', subcategory: 'Tijolo', active: true }];
        else if (pathname.endsWith('/dashboard')) {
          if (failDashboard) return route.fulfill({ status: 503, json: { error: { message: 'Falha simulada do resumo' } } });
          data = {
            metrics: { totalWealth: 120000, totalProfit: 20000, returnPercentage: 20, monthlyDividends: 350, yearlyDividends: 2500, monthlyContributions: 1500, yearlyContributions: 15000, assetCount: 8, investedValue: 100000, currentValue: 120000, netProfit: 22500 },
            wealthEvolution: [{ month: 'Ago', invested: 97000, current: 115000 }, { month: 'Set', invested: 98500, current: 117000 }, { month: 'Out', invested: 100000, current: 120000 }],
            categoryAllocation: [{ category: 'FII', value: 60000, currentPercentage: 50, targetPercentage: 50, color: '#22c55e' }, { category: 'Ações', value: 60000, currentPercentage: 50, targetPercentage: 50, color: '#3b82f6' }],
            monthlyDividends: [{ month: 'Set', value: 300 }, { month: 'Out', value: 350 }],
            monthlyContributions: [{ month: 'Set', value: 1500 }, { month: 'Out', value: 1500 }],
            recommendation: { ticker: 'TEST11', category: 'FII', action: 'Carteira equilibrada', reason: 'Cenário fictício para validação de interface.', comparison: [] }, recentMovements: []
          };
        }
        else if (pathname.endsWith('/market/refresh')) {
          await new Promise(resolve => setTimeout(resolve, 350));
          if (failRefresh) return route.fulfill({ status: 503, json: { error: { message: 'Falha simulada de atualização' } } });
          data = { provider: 'mock', refreshedAt: '2026-10-02T12:00:00Z', total: 1, requested: 1, updated: 1, stale: 0, failed: 0, unsupported: 0 };
        }
        return route.fulfill({ json: { data } });
      });
      await page.goto(`${baseURL}/ativos`);
      await page.getByRole('heading', { name: 'Gerenciar ativos' }).waitFor();
      await page.getByText('Ativo de teste', { exact: true }).locator('visible=true').first().waitFor();
      const check = async (name, fn) => {
        try { await fn(); results.push({ viewport: viewport.width, name, passed: true }); }
        catch (error) { results.push({ viewport: viewport.width, name, passed: false, error: error.message }); }
      };
      await check('no horizontal page overflow', async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)));
      await check('search clear restores records and focus', async () => {
        const search = page.getByRole('searchbox', { name: 'Pesquisar ativos' });
        await search.fill('no-matching-asset');
        await page.getByText('Nenhum registro encontrado.').waitFor();
        await page.getByRole('button', { name: /Limpar busca|Limpar pesquisa/ }).click({ timeout: 2000 });
        assert.equal(await search.inputValue(), '');
        assert(await search.evaluate(el => el === document.activeElement));
      });
      await page.getByRole('searchbox', { name: 'Pesquisar ativos' }).fill('');
      await check('dialog traps focus, Escape closes, restores trigger', async () => {
        const trigger = page.getByRole('button', { name: 'Novo ativo', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Novo ativo', exact: true });
        await dialog.waitFor();
        assert(await dialog.evaluate(el => el.contains(document.activeElement)));
        for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))); }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden', timeout: 2000 });
        assert(await trigger.evaluate(el => el === document.activeElement));
      });
      if (await page.getByRole('dialog').count()) await page.getByRole('button', { name: 'Fechar modal' }).click();
      if (viewport.width < 1024) await check('mobile menu traps focus and restores trigger', async () => {
        const trigger = page.getByRole('button', { name: 'Abrir menu' });
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert(await dialog.evaluate(el => el.contains(document.activeElement)));
        for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(el => el.contains(document.activeElement))); }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert(await trigger.evaluate(el => el === document.activeElement));
      });
      await page.keyboard.press('Escape');
      await check('refresh failure communicated and retry succeeds', async () => {
        const refresh = page.getByRole('button', { name: /Atualizar cotações|Atualizando cotações/ });
        await refresh.click();
        assert(await refresh.isDisabled());
        await page.getByText('Não foi possível atualizar as cotações. Tente novamente.', { exact: true }).waitFor({ timeout: 3000 });
        failRefresh = false;
        await refresh.click();
        await page.getByText('Cotações atualizadas.', { exact: true }).waitFor({ timeout: 3000 });
        assert.equal(await page.getByText('Não foi possível atualizar as cotações. Tente novamente.', { exact: true }).count(), 0);
      });
      await page.screenshot({ path: path.join(output, `assets-${viewport.width}.png`), fullPage: true });
      await check('dashboard failure recovery and keyboard disclosure', async () => {
        await page.goto(baseURL);
        await page.getByRole('heading', { name: 'Não foi possível carregar o resumo' }).waitFor();
        failDashboard = false;
        await page.getByRole('button', { name: 'Tentar novamente' }).click();
        await page.getByRole('heading', { name: 'Visão geral do patrimônio' }).waitFor();
        const summary = page.locator('summary').filter({ hasText: 'Mais indicadores da carteira' });
        assert.equal(await page.getByText('Quantidade de ativos', { exact: true }).isVisible(), false);
        await summary.focus();
        await page.keyboard.press('Enter');
        assert(await page.getByText('Quantidade de ativos', { exact: true }).isVisible());
        await page.keyboard.press('Enter');
        assert.equal(await page.getByText('Quantidade de ativos', { exact: true }).isVisible(), false);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      });
      await page.screenshot({ path: path.join(output, `dashboard-${viewport.width}.png`), fullPage: true });
      results.push({ viewport: viewport.width, name: 'no uncaught page errors', passed: errors.length === 0, errors });
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ mockedAPI: true, output, results }, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
