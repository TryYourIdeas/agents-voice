import { test, expect } from '@playwright/test'

test('add a model configuration, replay a logged turn, browse the sandbox', async ({ page }) => {
  // 1. model configuration
  await page.goto('/models')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Qwen 3.5')
  await page.getByLabel('Model name').fill('qwen3.5-4b')
  await page.getByLabel('Base URL').fill('http://llama-server:5050')
  await page.getByLabel('API key').fill('sk-test-1234')
  await page.getByRole('button', { name: 'Save' }).click()
  const row = page.getByRole('row', { name: /Qwen 3.5/ })
  await expect(row).toContainText('qwen3.5-4b')
  await expect(row).toContainText('••••1234')
  await expect(page.getByText('sk-test-1234')).toHaveCount(0)

  // 2. logs: new column and the Replay link
  await page.goto('/logs')
  await expect(page.getByRole('cell', { name: 'Reasoning model' })).toBeVisible()
  await page.getByRole('link', { name: 'Replay turn 1' }).click()

  // 3. replay
  await expect(page.getByText('summarize my mail').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run replay' })).toBeDisabled()
  await page.getByLabel('Model configuration').selectOption({ label: 'Qwen 3.5 (qwen3.5-4b)' })
  await page.getByRole('button', { name: 'Run replay' }).click()

  const messages = page.getByRole('region', { name: 'Messages' })
  await expect(messages.getByText('Here is your summary')).toBeVisible()

  await page.getByRole('button', { name: 'notes/todo.txt' }).click()
  await expect(page.getByRole('region', { name: 'File contents' })).toContainText('buy milk')

  await page.getByRole('button', { name: /Invoice 42/, exact: false }).first().click()
  await expect(page.getByRole('article', { name: 'Email' })).toContainText('Please pay invoice 42.')
  await page.getByRole('button', { name: /Re: Invoice 42/ }).click()
  await expect(page.getByRole('article', { name: 'Email' })).toContainText('Paid, thanks.')

  // 4. the replay is linked to the original in the logs
  await page.goto('/logs')
  await expect(page.getByRole('button', { name: 'Open original turn 1' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'qwen3.5-4b' })).toBeVisible()
})
