import { test as guestTest, expect as guestExpect, type Page } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

/**
 * Regression tests for UI breaks that shipped past CI once, each named after
 * what went wrong, so the same break fails a test the next time.
 */

/** The sliding indicator's box against the selected tab's box. */
async function indicatorVsTab(page: Page) {
  return page.evaluate(() => {
    const tab = document.querySelector('[data-home-tab][aria-selected="true"]') as HTMLElement;
    const ind = tab.parentElement!.querySelector('.home-tab-indicator') as HTMLElement;
    const t = tab.getBoundingClientRect(), i = ind.getBoundingClientRect();
    return { leftGap: Math.abs(t.left - i.left), widthGap: Math.abs(t.width - i.width) };
  });
}

guestTest.describe('Home tab bar — the indicator', () => {
  // Shipped once measured before the font and Tailwind's CSS arrived, so it was
  // narrower than its tab and clipped the label ("Success Stori").
  guestTest('covers the selected tab exactly, on load, after switching and after a resize', async ({ page }) => {
    await page.goto('/#projects');
    await guestExpect(page.getByTestId('home-tab-overview')).toHaveAttribute('aria-selected', 'true');
    await page.evaluate(() => document.fonts.ready);
    const settled = async () => {
      // The indicator slides with a short transition; poll until it has arrived.
      await guestExpect.poll(async () => {
        const g = await indicatorVsTab(page);
        return Math.max(g.leftGap, g.widthGap);
      }).toBeLessThanOrEqual(1);
    };
    await settled();

    await page.getByTestId('home-tab-ai').click();
    await settled();

    await page.setViewportSize({ width: 900, height: 800 });
    await settled();
  });
});

guestTest.describe('KPI section — roadmap card tooltips', () => {
  // A description containing double quotes once broke out of its title="..."
  // attribute, cutting the tooltip short and leaking text into the markup.
  guestTest('each unmeasured KPI\'s tooltip is its full description, quotes included', async ({ page }) => {
    await page.goto('/#home/kpis');
    const cards = page.getByTestId('kpi-roadmap-grid').locator('[data-testid^="kpi-card-"]');
    await guestExpect(cards.first()).toBeVisible();
    const pairs = await cards.evaluateAll((els) => els.map((el) => ({
      id: el.getAttribute('data-testid'),
      title: el.getAttribute('title'),
      text: el.querySelector('p')!.textContent!.trim(),
    })));
    guestExpect(pairs.length, 'roadmap cards').toBeGreaterThan(3);
    for (const { id, title, text } of pairs) guestExpect(title, `${id} tooltip`).toBe(text);
    // The one with quotes in it, specifically.
    const readiness = pairs.find((p) => p.id === 'kpi-card-release-readiness')!;
    guestExpect(readiness.title).toContain('"all required CI checks pass on main"');
  });
});

guestTest.describe('Hero headline', () => {
  // A word-by-word blur once split the gradient headline into transformed
  // spans, and the words rendered on top of each other.
  guestTest('renders as one block of text, with nothing inside it transformed or filtered', async ({ page }) => {
    await page.goto('/#projects');
    const title = page.locator('.owner-banner h2');
    // The <br> between the two lines adds no space to the text.
    await guestExpect(title).toHaveText(/^Leading Automation Architecture &\s*AI-Driven Quality Strategy$/);
    const inner = await title.evaluate((h2) => Array.from(h2.querySelectorAll('*')).map((el) => ({
      tag: el.tagName,
      transform: getComputedStyle(el).transform,
      filter: getComputedStyle(el).filter,
    })));
    guestExpect(inner.filter((e) => e.tag !== 'BR'), 'elements inside the headline').toEqual([]);
    // The blur-in wrapper finishes fully sharp and opaque.
    const wrapper = title.locator('xpath=..');
    await guestExpect.poll(() => wrapper.evaluate((el) => {
      const s = getComputedStyle(el);
      // "blur(0px)" is the animation's end state; it is as sharp as "none".
      return `${s.filter === 'blur(0px)' ? 'none' : s.filter}|${s.opacity}`;
    }), { timeout: 5000 }).toBe('none|1');
  });
});

/** Accessible-ish names: aria-label, else visible text, of the visible buttons in a container. */
async function buttonNames(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => Array.from(root.querySelectorAll('button'))
    .filter((b) => (b as HTMLElement).offsetParent !== null)
    .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' '))
    .filter(Boolean));
}

authTest.describe('Header controls vs page controls', () => {
  // The header's Search button once took the same name as the Log Center's
  // own Search button, so "the Search button" stopped meaning one thing.
  authTest('no header button shares its name with a button on the page', async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    for (const hash of ['#projects', '#environments', '#logs', '#users']) {
      await page.goto(`/${hash}`);
      // An empty projects list has no h1, just its "No projects yet" heading.
      await authExpect(page.locator('.view:not(.hidden) :is(h1, h2)').first()).toBeVisible();
      const header = await buttonNames(page, '#app-header');
      const main = new Set(await buttonNames(page, '#main-content'));
      authExpect(header.filter((n) => main.has(n)), `${hash}: names in both header and page`).toEqual([]);
    }
  });
});
