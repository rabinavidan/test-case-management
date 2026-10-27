import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// Milestone 2 of the portfolio plan (Tech Lead positioning): role label,
// hero CTAs, Leadership Impact / delivery-workflow sections, guest-visible
// architecture, and a de-emphasized (but still functional) Sign in.

guestTest.describe('Guest recruiter view — Tech Lead positioning', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('the hero shows the Tech Lead role label, not the old title', async ({ page }) => {
    // assertion-change-approved: the hero was repositioned for senior automation, infra and backend roles
    await guestExpect(page.getByText('Senior Automation Engineer · Test Infrastructure · Backend')).toBeVisible();
    await guestExpect(page.getByTestId('hero-leadership')).toContainText('Israel, USA and India');
    await guestExpect(page.locator('.owner-banner').getByText('AFEKA / Tel Aviv University Branch')).toBeVisible();
    await guestExpect(page.getByText('Senior Automation Engineer', { exact: true })).toHaveCount(0);
  });

  guestTest('all four hero CTAs are present, in order, with working destinations', async ({ page }) => {
    const row = page.getByTestId('hero-cta-row');
    await guestExpect(row).toBeVisible();

    const buttons = row.locator('button, a');
    await guestExpect(buttons).toHaveCount(4);

    await guestExpect(page.getByTestId('hero-tour-btn')).toHaveText(/Take the 3-min Tour/);
    await guestExpect(page.getByTestId('hero-explore-demo-btn')).toHaveText(/Explore Live Demo/);
    // assertion-change-approved: the site owner asked to withdraw the CV download; these checks now assert it is gone.
    // The CV is not published on the site: no download button, and no file to fetch.
    await guestExpect(page.getByTestId('hero-cv-btn')).toHaveCount(0);
    const cv = await page.request.get('/static/Rabin_Avidan_CV.pdf');
    guestExpect(cv.status()).toBe(404);

    const githubLink = page.getByTestId('hero-github-btn');
    await guestExpect(githubLink).toHaveAttribute('href', 'https://github.com/rabinavidan/test-case-management');
    await guestExpect(githubLink).toHaveAttribute('target', '_blank');

    const linkedinLink = page.getByTestId('hero-linkedin-btn');
    await guestExpect(linkedinLink).toHaveAttribute('href', /linkedin\.com/);
    await guestExpect(linkedinLink).toHaveAttribute('href', 'https://www.linkedin.com/in/rabin-avidan/');

    // The tour leads, then Explore Live Demo, View GitHub, Connect on LinkedIn.
    const testIds = await buttons.evaluateAll(els => els.map(el => el.getAttribute('data-testid')));
    guestExpect(testIds).toEqual([
      'hero-tour-btn',
      'hero-explore-demo-btn',
      'hero-github-btn',
      'hero-linkedin-btn',
    ]);
  });

  guestTest('the Architecture tab reveals the architecture panel without signing in', async ({ page }) => {
    const content = page.locator('#showcase-content');
    // Panel starts collapsed - opening it must never trigger a sign-in
    // prompt or an error toast.
    await page.getByTestId('home-tab-engineering').click();
    await page.getByTestId('home-subtab-architecture').click();
    await page.locator('#showcase-toggle-btn').click();
    await guestExpect(content).toBeVisible({ timeout: 5000 });
    await guestExpect(page.locator('#auth-modal')).toHaveClass(/hidden/);
  });

  guestTest('the Leadership Impact section shows five repo-evidenced cards', async ({ page }) => {
    await page.getByTestId('home-tab-engineering').click();
    await page.getByTestId('home-subtab-leadership').click();
    const section = page.getByTestId('leadership-impact-section');
    await guestExpect(section).toBeVisible();
    await guestExpect(section.getByText('Technical Direction & Governance')).toBeVisible();
    await guestExpect(section.getByText('Quality Strategy')).toBeVisible();
    await guestExpect(section.getByText('CI/CD Governance')).toBeVisible();
    await guestExpect(section.getByText('Architecture & Delivery')).toBeVisible();
    await guestExpect(section.getByText('AI-First Engineering')).toBeVisible();
  });

  guestTest('the delivery workflow section shows all six steps in order', async ({ page }) => {
    await page.getByTestId('home-tab-engineering').click();
    await page.getByTestId('home-subtab-leadership').click();
    const section = page.getByTestId('delivery-workflow-section');
    await guestExpect(section).toBeVisible();
    const steps = ['Product Requirements', 'Technical Roadmap', 'Epics & Stories', 'Sprint Delivery', 'Quality Gates', 'KPI Review'];
    for (const step of steps) {
      await guestExpect(section.getByText(step, { exact: false })).toBeVisible();
    }
    // In order, and every step whole inside the card - none cut off behind a
    // sideways scroll, as the last one used to be on desktop.
    const items = section.getByTestId('delivery-step');
    await guestExpect(items).toHaveCount(6);
    const texts = await items.allTextContents();
    steps.forEach((step, i) => guestExpect(texts[i]).toContain(`${i + 1}. ${step}`));
    const card = (await section.locator('ol').boundingBox())!;
    for (const box of await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
      guestExpect(box.right).toBeLessThanOrEqual(card.x + card.width + 1);
      guestExpect(card.x - box.left).toBeLessThanOrEqual(1);
    }
  });

  guestTest('Sign in is present but styled as a secondary action, and still opens the auth modal', async ({ page }) => {
    const signIn = page.getByTestId('signin-btn');
    await guestExpect(signIn).toBeVisible();
    const classes = await signIn.getAttribute('class');
    guestExpect(classes).not.toContain('bg-brand-600');

    await signIn.click();
    await guestExpect(page.locator('#auth-modal')).not.toHaveClass(/hidden/);
  });
});

authTest.describe('Signed-in view — portfolio sections are guest-only', () => {
  authTest.beforeEach(async ({ page, authToken }) => {
    await page.addInitScript((token) => localStorage.setItem('tf_token', token), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  authTest('leadership and workflow sections do not show for a signed-in user', async ({ page }) => {
    await authExpect(page.getByTestId('leadership-impact-section')).toHaveCount(0);
    await authExpect(page.getByTestId('delivery-workflow-section')).toHaveCount(0);
    await authExpect(page.getByTestId('hero-cta-row')).toHaveCount(0);
  });
});
