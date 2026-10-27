import { test, expect } from '@playwright/test';
import { test as seededTest } from '../fixtures/auth.fixture';

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
    // assertion-change-approved: the owner asked for Professional Development right after Education
    await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Education', 'Professional Development', 'Professional Certifications']);
    const groups = section.getByTestId('credentials-group');
    await expect(groups.nth(0).locator('li p.font-semibold')).toHaveText(['B.Sc. Electronic & Computer Engineering']);
    await expect(groups.nth(1).locator('li p.font-semibold')).toHaveText(['Emerging Leader', 'Build with AI: Reasoning Models for AI Agents']);
    await expect(groups.nth(1)).toContainText('ZoomInfo · Leadership development program');
    await expect(groups.nth(1)).toContainText('LinkedIn · Course completion');
    await expect(groups.nth(2).locator('li p.font-semibold')).toHaveText(['ISTQB', 'MCSD']);
    expect(await section.innerText()).not.toMatch(/(19|20)\d{2}/);
    // No verified credential URL or certificate file exists yet, so nothing links.
    await expect(section.locator('a, button')).toHaveCount(0);
  });

  test('side by side with About, the card matches its height and scrolls instead of leaving a gap', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const about = page.getByTestId('overview-section').getByRole('heading', { name: 'About Me' }).locator('..');
    const card = page.getByTestId('overview-credentials');
    // Polled: the cards' entrance animation moves them for a moment after load.
    const gap = async () => {
      const [a, c] = [await about.boundingBox(), await card.boundingBox()];
      return Math.max(Math.abs(a!.height - c!.height), Math.abs(a!.y - c!.y));
    };
    await expect.poll(gap, { message: 'card vs About: largest height or top difference (px)' }).toBeLessThanOrEqual(1);
    const scroll = page.getByTestId('overview-credentials-scroll');
    await expect(scroll).toHaveAttribute('tabindex', '0');
    // Every entry stays reachable by scrolling.
    await scroll.getByText('MCSD', { exact: true }).scrollIntoViewIfNeeded();
    await expect(scroll.getByText('MCSD', { exact: true })).toBeInViewport();
  });

  test('its shortcuts open the tab they name', async ({ page }) => {
    await page.getByTestId('overview-go-demo').click();
    await expect(page.getByTestId('home-tab-demo')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ai-live-demo-section')).toBeVisible();
  });
});

test.describe('Home page — navigation', () => {
  // The Test Workspace tab shows only once a project exists, so these two
  // create one (signed in) and then look at the page as a guest.
  seededTest('seven tabs in order, opening on About Me', async ({ page, authedRequest }) => {
    const { id } = await (await authedRequest.post('/api/projects', { data: { name: `e2e-nav-${Date.now()}` } })).json();
    try {
      await page.goto('/#projects');
      const tabs = page.getByRole('tablist', { name: 'Explore this site' }).getByRole('tab');
      await expect(tabs).toHaveCount(7);
      await expect(tabs).toContainText(['About Me', 'Portfolio', 'Engineering Practices', 'AI Engineering', 'AI Pipeline', 'Engineering Insights', 'Test Workspace']);
      await expect(page.getByTestId('home-tab-overview')).toHaveAttribute('aria-selected', 'true');
      await page.getByTestId('home-tab-engineering').click();
      await expect(page.getByTestId('engineering-topics').getByRole('tab')).toHaveText(['Test Strategy', 'Quality Metrics', 'How TestFlow Works', 'Technical Leadership']);
    } finally {
      await authedRequest.delete(`/api/projects/${id}`);
    }
  });

  seededTest('Explore TestFlow opens the Test Workspace, and Watch AI Pipeline the walkthrough', async ({ page, authedRequest }) => {
    const { id } = await (await authedRequest.post('/api/projects', { data: { name: `e2e-nav-${Date.now()}` } })).json();
    try {
      await page.goto('/#projects');
      await page.getByTestId('hero-explore-demo-btn').click();
      await expect(page.getByTestId('home-tab-projects')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#home-panel-projects h1')).toHaveText('Test Workspace');
      await page.getByTestId('hero-ai-pipeline-btn').click();
      await expect(page.getByTestId('home-tab-demo')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('pipe-illustrative-label')).toHaveText('Illustrative walkthrough. No live AI calls.');
    } finally {
      await authedRequest.delete(`/api/projects/${id}`);
    }
  });

  // With no projects there is no Test Workspace tab, so Explore TestFlow falls
  // back to the demo project - and once left the button reading "Run TestFlow Demo".
  test('with no projects, Explore TestFlow keeps its own label after the demo fallback', async ({ page }) => {
    await page.route('**/api/projects?page_size=100', (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 100, total_pages: 1 } }));
    await page.goto('/#projects');
    const label = page.locator('#hero-demo-label');
    await expect(label).toHaveText('Explore TestFlow');
    await page.getByTestId('hero-explore-demo-btn').click();
    await expect(page.locator('#toast-inner')).toContainText('No demo project is seeded yet');
    await expect(page.getByTestId('hero-explore-demo-btn')).toBeEnabled();
    await expect(label).toHaveText('Explore TestFlow');
  });

  test('old deep links still open their tab', async ({ page }) => {
    await page.goto('/#home/stories');
    await expect(page.getByTestId('home-tab-stories')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('home-tab-stories')).toHaveText(/Engineering Insights/);
    await page.goto('/#home/architecture');
    await expect(page.getByTestId('home-subtab-architecture')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('home-subtab-architecture')).toHaveText('How TestFlow Works');
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
