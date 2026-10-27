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

  // The site owner chose not to publish an employer timeline. The one
  // exception is a certificate's issuer: ZoomInfo issued Emerging Leader.
  test('names no employer, except as a certificate issuer', async ({ page }) => {
    const text = await page.getByTestId('overview-section').innerText();
    // assertion-change-approved: the owner asked for ZoomInfo as the Emerging Leader issuer
    for (const employer of ['Samsung', 'iMDsoft', 'NCR']) expect(text.includes(employer), `mentions ${employer}`).toBe(false);
    expect(text.split('ZoomInfo').length - 1, 'ZoomInfo mentions').toBe(1);
    await expect(page.getByTestId('overview-credentials').getByText('ZoomInfo · Leadership development program')).toBeVisible();
  });

  test('education, certifications and professional development, in that order, with no dates or links', async ({ page }) => {
    const section = page.getByTestId('overview-credentials');
    await expect(section.getByRole('heading', { name: 'Education, Certifications & Professional Development' })).toBeVisible();
    await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Education', 'Professional Certifications', 'Professional Development']);
    const groups = section.getByTestId('credentials-group');
    await expect(groups.nth(0).locator('li p.font-semibold')).toHaveText(['B.Sc. Electronic & Computer Engineering']);
    await expect(groups.nth(1).locator('li p.font-semibold')).toHaveText(['ISTQB', 'MCSD']);
    await expect(groups.nth(2).locator('li p.font-semibold')).toHaveText(['Emerging Leader', 'Build with AI: Reasoning Models for AI Agents']);
    await expect(groups.nth(2)).toContainText('LinkedIn · Course completion');
    expect(await section.innerText()).not.toMatch(/(19|20)\d{2}/);
    // No verified credential URL or certificate file exists yet, so nothing links.
    await expect(section.locator('a, button')).toHaveCount(0);
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
