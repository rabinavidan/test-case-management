import { test, expect, type Page } from '@playwright/test';

/**
 * The hero's impact row: four numbers a recruiter sees without opening a tab.
 * Each must match where the page states it in full - the Test Pyramid and the
 * KPI cards - so the hero can never claim something the page contradicts.
 */

/** The impact row as { label: value }. */
async function impact(page: Page): Promise<Record<string, string>> {
  const row = page.getByTestId('hero-impact');
  await expect(row).toBeVisible();
  const pairs = await row.locator(':scope > div').evaluateAll((items) => items.map((el) => [
    el.querySelector('dt')!.textContent!.trim(),
    el.querySelector('dd')!.textContent!.trim(),
  ]));
  return Object.fromEntries(pairs);
}

test.describe('Hero impact row', () => {
  test('shows tests, coverage, CI gates and test stacks', async ({ page }) => {
    await page.goto('/#projects');
    const facts = await impact(page);
    expect(Object.keys(facts)).toEqual(['automated tests', 'code coverage', 'CI quality gates', 'test stacks']);
    for (const [label, value] of Object.entries(facts)) expect(value, label).toMatch(/^\d+(\.\d+)?%?$/);
  });

  test('its test count is the Test Pyramid\'s total', async ({ page }) => {
    await page.goto('/#home/strategy');
    const facts = await impact(page);
    const levels = await page.getByTestId('test-pyramid-section').getByText(/^\d+ tests$/).allTextContents();
    expect(levels.length, 'pyramid levels').toBe(4);
    const total = levels.reduce((n, t) => n + parseInt(t, 10), 0);
    expect(facts['automated tests']).toBe(String(total));
  });

  test('its coverage and CI gates match the KPI cards', async ({ page }) => {
    await page.goto('/#home/kpis');
    const facts = await impact(page);
    await expect(page.getByTestId('kpi-card-code-coverage')).toContainText(facts['code coverage']);
    await expect(page.getByTestId('kpi-card-quality-gate-status')).toContainText(`${facts['CI quality gates']} gates enforced`);
    await expect(page.getByTestId('kpi-card-test-inventory')).toContainText(`${facts['automated tests']} tests`);
  });

  test('on a phone the impact row replaces the skills chips, keeping the hero short', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#projects');
    await expect(page.getByTestId('hero-impact')).toBeVisible();
    await expect(page.getByTestId('hero-skills')).toBeHidden();
  });

  test('on wider screens the skills chips stay', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/#projects');
    await expect(page.getByTestId('hero-skills')).toBeVisible();
    await expect(page.getByTestId('hero-impact')).toBeVisible();
  });
});
