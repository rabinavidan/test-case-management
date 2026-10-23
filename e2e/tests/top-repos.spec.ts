import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// The Open-Source Repositories section: the owner's top public GitHub repos
// with their stacks, right after the Success Stories carousel, for guests.
const REPOS = [
  'test-case-management', 'automation-failure-orchestrator', 'playwright-kafka-microservices',
  'storguard-distributed-storage-testing', 'appium-iOS-task-manager', 'TradeFlow',
];
const WITH_LIVE_LINK = ['test-case-management', 'playwright-kafka-microservices'];

guestTest.describe('Guest home page — Open-Source Repositories', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#home/repos');
    await page.waitForLoadState('networkidle');
    await guestExpect(page.getByTestId('top-repos-section')).toBeVisible();
  });

  guestTest('sits after Success Stories and before the Live Demo section', async ({ page }) => {
    const order = await page.evaluate(() => {
      const [stories, repos, demo] = ['success-stories-section', 'top-repos-section', 'ai-live-demo-section']
        .map((id) => document.querySelector(`[data-testid="${id}"]`));
      if (!stories || !repos || !demo) return 'missing';
      const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return after(stories, repos) && after(repos, demo) ? 'ok' : 'out of order';
    });
    guestExpect(order).toBe('ok');
    await guestExpect(page.getByRole('heading', { name: 'Open-Source Repositories' })).toBeVisible();
  });

  guestTest('lists the six repos, each linking to its GitHub source with a fact and its stack', async ({ page }) => {
    const cards = page.getByTestId('repo-card');
    await guestExpect(cards).toHaveCount(REPOS.length);

    for (let i = 0; i < REPOS.length; i++) {
      const card = cards.nth(i);
      await guestExpect(card).toHaveAttribute('data-repo', REPOS[i]);
      const code = card.getByTestId('repo-code-link');
      await guestExpect(code).toHaveAttribute('href', `https://github.com/rabinavidan/${REPOS[i]}`);
      await guestExpect(code).toHaveAttribute('target', '_blank');
      await guestExpect(code).toHaveAttribute('rel', /noopener/);
      await guestExpect(card.getByTestId('repo-fact')).not.toBeEmpty();
      guestExpect(await card.getByRole('list', { name: 'Technologies' }).getByRole('listitem').count()).toBeGreaterThanOrEqual(5);

      const live = card.getByTestId('repo-live-link');
      if (WITH_LIVE_LINK.includes(REPOS[i])) {
        await guestExpect(live).toHaveAttribute('href', /^https:\/\//);
        await guestExpect(live).toHaveAttribute('rel', /noopener/);
      } else {
        await guestExpect(live).toHaveCount(0);
      }
    }
  });

  guestTest('the technologies summary counts exactly what the cards list, most-used first', async ({ page }) => {
    const fromCards = await page.getByTestId('repo-card').evaluateAll((cards) => {
      const counts: Record<string, number> = {};
      for (const c of cards) {
        for (const li of Array.from(c.querySelectorAll('[aria-label="Technologies"] li'))) {
          const t = li.textContent!.trim();
          counts[t] = (counts[t] || 0) + 1;
        }
      }
      return counts;
    });
    const summary = await page.getByTestId('repos-tech').evaluateAll((items) =>
      items.map((i) => ({ tech: i.getAttribute('data-tech')!, count: Number(i.getAttribute('data-count')) })),
    );

    guestExpect(summary.length).toBeGreaterThan(0);
    // Every shared technology appears, with the right count; one-offs don't.
    const shared = Object.entries(fromCards).filter(([, c]) => c > 1).map(([t]) => t).sort();
    guestExpect(summary.map((s) => s.tech).sort()).toEqual(shared);
    for (const s of summary) guestExpect(s.count, s.tech).toBe(fromCards[s.tech]);
    const counts = summary.map((s) => s.count);
    guestExpect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

// The section is the same shared carousel as Success Stories (whose spec
// covers the engine's edge cases); these pin that it is one, and that the
// two carousels on the page don't drive each other.
guestTest.describe('Guest home page — repositories carousel', () => {
  const scrollLeft = (page: import('@playwright/test').Page, prefix: string) =>
    page.getByTestId(`${prefix}-track`).evaluate((t) => t.scrollLeft);

  guestTest('Next, Previous and the dots move only this carousel', async ({ page }) => {
    // A paused fake clock keeps auto-advance from firing.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.goto('/#home/repos');
    await page.waitForLoadState('networkidle');
    const prev = page.getByTestId('repos-prev');
    const next = page.getByTestId('repos-next');
    const dots = page.getByTestId('repos-dots').getByRole('button');

    await guestExpect(page.getByTestId('repo-card').first()).toHaveAttribute('role', 'group');
    await guestExpect(page.getByTestId('repo-card').first()).toHaveAttribute('aria-roledescription', 'slide');
    await guestExpect(dots).toHaveCount(REPOS.length);
    await guestExpect(prev).toBeDisabled();
    await guestExpect(next).toHaveAttribute('aria-label', 'Next repository');

    await next.click();
    await guestExpect.poll(() => scrollLeft(page, 'repos')).toBeGreaterThan(0);
    guestExpect(await scrollLeft(page, 'stories')).toBe(0);

    await dots.last().click();
    await guestExpect(next).toBeDisabled();
    await guestExpect(dots.last()).toHaveAttribute('aria-current', 'true');
    // Success Stories, in its own (hidden) tab, has not moved.
    guestExpect(await scrollLeft(page, 'stories')).toBe(0);

    await prev.click();
    await guestExpect(next).toBeEnabled();
  });

  guestTest('stays paused while its tab is hidden, and runs once its tab opens', async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await page.mouse.move(0, 0);
    const repos = page.getByTestId('top-repos-section');
    // The home page opens on the Success Stories tab.
    await guestExpect(repos).toBeHidden();
    await guestExpect(repos).toHaveAttribute('data-autoplay', 'paused');

    await page.getByTestId('home-tab-repos').click();
    await page.mouse.move(0, 0);
    await guestExpect(repos).toHaveAttribute('data-autoplay', 'running');
  });

  guestTest('auto-advances on its own clock, and pausing it leaves Success Stories running', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2200 });
    // Paused before the page loads, so no tick can fire during setup however
    // slow it is; only runFor() moves time. (install() alone lets fake time
    // flow at real speed.)
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.goto('/#home/repos');
    await page.waitForLoadState('networkidle');
    await page.mouse.move(0, 0);
    const repos = page.getByTestId('top-repos-section');
    const stories = page.getByTestId('success-stories-section');
    await guestExpect(repos).toHaveAttribute('data-autoplay', 'running');

    // Paused here, it stays put; Success Stories, back in its own tab, runs.
    await page.getByTestId('repos-autoplay').click();
    await page.getByTestId('home-tab-stories').click();
    await page.mouse.move(0, 0);
    await guestExpect(page.getByTestId('repos-autoplay')).toHaveAttribute('aria-label', 'Play auto-advance');
    await guestExpect(repos).toHaveAttribute('data-autoplay', 'paused');
    await guestExpect(stories).toHaveAttribute('data-autoplay', 'running');

    await page.clock.runFor(5100);
    await guestExpect.poll(() => scrollLeft(page, 'stories')).toBeGreaterThan(0);
    guestExpect(await scrollLeft(page, 'repos')).toBe(0);
  });
});

authTest.describe('Signed-in home page — Open-Source Repositories is guest-only', () => {
  authTest('does not show for a signed-in user', async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await authExpect(page.getByTestId('top-repos-section')).toHaveCount(0);
  });
});
