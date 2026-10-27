import { test, expect } from '@playwright/test';

/**
 * The guest home page opens on an Overview tab, and Engineering groups five
 * topics behind a second row of tabs. #home/<topic> links straight to one.
 */

test.describe('Home page — Overview tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await expect(page.getByTestId('home-tab-overview')).toBeVisible();
  });

  test('is the tab the home page opens on, with About, education and skills', async ({ page }) => {
    await expect(page.getByTestId('home-tab-overview')).toHaveAttribute('aria-selected', 'true');
    const overview = page.getByTestId('overview-section');
    await expect(overview).toBeVisible();
    await expect(overview.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(overview.getByText('Israel, USA and India')).toBeVisible();
    await expect(overview.getByText('AFEKA / Tel Aviv University Branch')).toBeVisible();
    await expect(overview.getByText('ISTQB', { exact: true })).toBeVisible();
    await expect(page.getByTestId('overview-skills').locator('h3')).toHaveCount(6);
  });

  // The site owner chose not to publish an employer timeline.
  test('names no employer', async ({ page }) => {
    const text = await page.getByTestId('overview-section').innerText();
    for (const employer of ['ZoomInfo', 'Samsung', 'iMDsoft', 'NCR']) expect(text.includes(employer), `mentions ${employer}`).toBe(false);
  });

  test('its shortcuts open the tab they name', async ({ page }) => {
    await page.getByTestId('overview-go-demo').click();
    await expect(page.getByTestId('home-tab-demo')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ai-live-demo-section')).toBeVisible();
  });
});

test.describe('Home page — AI Engineering tab', () => {
  test('is a top-level tab of its own', async ({ page }) => {
    await page.goto('/#projects');
    await page.getByTestId('home-tab-ai').click();
    await expect(page.getByTestId('home-tab-ai')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ai-first-engineering-section')).toBeVisible();
  });
});

test.describe('Home page — Engineering topics', () => {
  test('a #home/<topic> link opens Engineering on that topic', async ({ page }) => {
    await page.goto('/#home/kpis');
    await expect(page.getByTestId('home-tab-engineering')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('home-subtab-kpis')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('kpi-dashboard-section')).toBeVisible();
    await expect(page.getByTestId('test-pyramid-section')).toBeHidden();
  });

  test('topics switch on click and with the arrow keys, and Engineering remembers the last one', async ({ page }) => {
    await page.goto('/#projects');
    await page.getByTestId('home-tab-engineering').click();
    // assertion-change-approved: Test Strategy is now the first Engineering topic, ahead of Leadership
    await expect(page.getByTestId('home-subtab-strategy')).toHaveAttribute('aria-selected', 'true');

    await page.getByTestId('home-subtab-strategy').click();
    await expect(page.getByTestId('test-pyramid-section')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('home-subtab-kpis')).toBeFocused();
    await expect(page.getByTestId('kpi-dashboard-section')).toBeVisible();

    await page.getByTestId('home-tab-overview').click();
    await page.getByTestId('home-tab-engineering').click();
    await expect(page.getByTestId('home-subtab-kpis')).toHaveAttribute('aria-selected', 'true');
  });
});
