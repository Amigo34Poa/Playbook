import { test, expect } from '@playwright/test';

test('cria, organiza e persiste um procedimento do TBS sem identificar a empresa', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Empresa confidencial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cadastro de cliente', exact: true }).click();
  await page.getByLabel('Cargo responsável').selectOption('Assistente de Vendas');
  await page.getByRole('button', { name: 'Adicionar etapa', exact: true }).click();
  await page.getByLabel('Título da etapa 1', { exact: true }).fill('Confira os dados do cliente');
  await page.getByLabel('Descrição da etapa 1', { exact: true }).fill('Confirme o CNPJ e o endereço antes de salvar no TBS.');
  await page.getByRole('button', { name: 'Adicionar etapa', exact: true }).click();
  await page.getByLabel('Título da etapa 2', { exact: true }).fill('Salve o cadastro');
  await page.getByRole('button', { name: 'Mover etapa 2 para cima', exact: true }).click();
  await expect(page.getByLabel('Título da etapa 1', { exact: true })).toHaveValue('Salve o cadastro');
  await expect(page.getByText('Salvo neste computador', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Cadastros Criar cadastro de cliente/ }).click();
  await expect(page.getByLabel('Título da etapa 2', { exact: true })).toHaveValue('Confira os dados do cliente');
  await expect(page.getByLabel('Cargo responsável')).toHaveValue('Assistente de Vendas');
  await expect(page.getByLabel('Descrição da etapa 2', { exact: true })).toHaveValue('Confirme o CNPJ e o endereço antes de salvar no TBS.');
});
test('filtra por cargo e nome e informa os limites da prévia no navegador', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo procedimento', exact: true }).click();
  await page.getByLabel('Título do procedimento', { exact: true }).fill('Prospecção ativa');
  await page.getByLabel('Cargo responsável').selectOption('SDR');
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByLabel('Buscar procedimento').fill('inexistente');
  await expect(page.getByRole('button', { name: /Vendas Prospecção ativa/ })).toHaveCount(0);
  await page.getByLabel('Buscar procedimento').fill('prospecção');
  await expect(page.getByRole('button', { name: /Vendas Prospecção ativa/ })).toBeVisible();
  await expect(page.getByText(/Prévia no navegador/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test('não simula captura nem IA na prévia web', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo procedimento', exact: true }).click();
  await page.getByRole('button', { name: 'Gravar processo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('aplicativo desktop para Windows');
  await expect(page.getByRole('button', { name: 'Organizar com IA', exact: true })).toBeDisabled();
});
