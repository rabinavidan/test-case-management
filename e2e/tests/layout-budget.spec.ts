import { test, expect, type Page } from '@playwright/test';

/**
 * Layout budget for the guest home page: its proportions at the screen sizes
 * people actually use, from a phone to a 1920px monitor. Each limit sits a
 * little above what the page measures today, so a change that bloats the
 * hero, wraps its buttons onto extra rows, pushes the tab bar off the first
 * screen or stretches an image fails here instead of on a recruiter's screen.
 *
 * The page ships its own font (Inter, static/fonts) so text - and with it
 * every height below - measures the same on Windows, macOS and Linux and in
 * every engine. Growing the hero on purpose means raising its budget here: a
 * reviewed, visible decision rather than a side effect.
 */

type Budget = {
  /** Max hero height, px. */
  heroMaxPx: number;
  /** Max hero height as a share of the viewport height. */
  heroMaxVh: number;
  /** Max rows the hero's call-to-action buttons may wrap onto. */
  ctaMaxRows: number;
  /** Max lines for the hero headline. */
  titleMaxLines: number;
  /** Must every home tab fit without the tab bar scrolling sideways? */
  tabsFit: boolean;
  /** Max Success Stories card height, px. */
  storyMaxPx: number;
};

const VIEWPORTS: Array<{ name: string; width: number; height: number; budget: Budget }> = [
  { name: 'full HD monitor', width: 1920, height: 1080, budget: { heroMaxPx: 320, heroMaxVh: 0.3, ctaMaxRows: 1, titleMaxLines: 2, tabsFit: true, storyMaxPx: 650 } },
  { name: 'laptop 1536 (125% scaling)', width: 1536, height: 864, budget: { heroMaxPx: 320, heroMaxVh: 0.37, ctaMaxRows: 1, titleMaxLines: 2, tabsFit: true, storyMaxPx: 650 } },
  { name: 'laptop 1440', width: 1440, height: 900, budget: { heroMaxPx: 320, heroMaxVh: 0.36, ctaMaxRows: 1, titleMaxLines: 2, tabsFit: true, storyMaxPx: 650 } },
  { name: 'laptop 1366', width: 1366, height: 768, budget: { heroMaxPx: 320, heroMaxVh: 0.42, ctaMaxRows: 1, titleMaxLines: 2, tabsFit: true, storyMaxPx: 650 } },
  { name: 'laptop 1280', width: 1280, height: 720, budget: { heroMaxPx: 320, heroMaxVh: 0.45, ctaMaxRows: 1, titleMaxLines: 2, tabsFit: true, storyMaxPx: 650 } },
  // At exactly 1024px a browser with a classic (space-taking) scrollbar sits just under the lg
  // breakpoint and shows two story cards per row instead of three; both are designed layouts,
  // so the card budget here is that it still fits on the screen.
  { name: 'small laptop / tablet landscape', width: 1024, height: 768, budget: { heroMaxPx: 320, heroMaxVh: 0.42, ctaMaxRows: 1, titleMaxLines: 2, tabsFit: false, storyMaxPx: 735 } },
  { name: 'tablet portrait', width: 768, height: 1024, budget: { heroMaxPx: 495, heroMaxVh: 0.49, ctaMaxRows: 2, titleMaxLines: 3, tabsFit: false, storyMaxPx: 590 } },
  { name: 'phone', width: 390, height: 844, budget: { heroMaxPx: 650, heroMaxVh: 0.78, ctaMaxRows: 4, titleMaxLines: 3, tabsFit: false, storyMaxPx: 530 } },
];

/** Everything the budget checks, measured in one pass. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    // The layout width: unlike innerWidth, it leaves out a scrollbar that takes up space.
    const layoutWidth = document.documentElement.clientWidth;
    const hero = document.querySelector('.owner-banner')!;
    const heroBox = box(hero);
    const ctas = Array.from(document.querySelectorAll('[data-testid="hero-cta-row"] > a, [data-testid="hero-cta-row"] > button')).map(box);
    // Buttons on one row share a top edge (give or take a pixel of shadow/border).
    const ctaRows: number[] = [];
    for (const r of ctas) if (!ctaRows.some((t) => Math.abs(t - r.top) < 8)) ctaRows.push(r.top);
    const ctaOverlap = ctas.some((a, i) => ctas.some((b, j) => i < j &&
      a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    const ctasInsideHero = ctas.every((r) => r.left >= heroBox.left && r.right <= heroBox.right + 0.5);
    const title = hero.querySelector('h2')!;
    const titleStyle = getComputedStyle(title);
    const tabs = document.querySelector('[data-testid="home-tabs"]')!;
    const tablist = tabs.querySelector('[role="tablist"]')!;
    const mainBox = box(document.getElementById('main-content')!);
    const slide = document.querySelector('[data-testid="story-slide"]')!;
    const img = slide.querySelector('img') as HTMLImageElement;
    const imgBox = box(img);
    return {
      layoutWidth,
      overflowX: document.documentElement.scrollWidth - layoutWidth,
      heroHeight: heroBox.height,
      ctaRows: ctaRows.length,
      ctaOverlap,
      ctasInsideHero,
      titleFontPx: parseFloat(titleStyle.fontSize),
      titleLines: Math.round(box(title).height / parseFloat(titleStyle.lineHeight)),
      tabsBottom: box(tabs).bottom,
      tabsScroll: tablist.scrollWidth - tablist.clientWidth,
      mainLeft: mainBox.left,
      mainRight: layoutWidth - mainBox.right,
      mainWidth: mainBox.width,
      storyHeight: box(slide).height,
      // Rendered aspect ratio over the image's own: 1 means not stretched or squashed.
      imgAspect: img.naturalWidth ? (imgBox.width / imgBox.height) / (img.naturalWidth / img.naturalHeight) : 1,
    };
  });
}

/** Waits until what the budget measures is final: styles, the font, the first story image. */
async function settle(page: Page) {
  await expect(page.getByTestId('hero-cta-row')).toBeVisible();
  // The Tailwind CDN builds its CSS after the markup lands; the hero's rounded corners say it has.
  await expect.poll(() => page.locator('.owner-banner').evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('16px');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.getByTestId('story-slide').first().locator('img')
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
}

test.describe('Home page typography', () => {
  test('uses the self-hosted Inter font, so layouts measure the same everywhere', async ({ page }) => {
    await page.goto('/#projects');
    await settle(page);
    expect(await page.evaluate(() => document.fonts.check('16px Inter')), 'Inter loaded').toBe(true);
    const family = await page.locator('.owner-banner h2').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.split(',')[0].replace(/["']/g, '').trim(), 'headline font').toBe('Inter');
    const font = await page.request.get('/static/fonts/Inter-latin.woff2');
    expect(font.status()).toBe(200);
  });
});

for (const { name, width, height, budget } of VIEWPORTS) {
  test.describe(`Home page layout budget — ${name} (${width}×${height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/#projects');
      await settle(page);
    });

    test('the hero stays within its height budget, with its buttons on the allowed number of rows', async ({ page }) => {
      const m = await measure(page);
      expect(m.heroHeight, 'hero height (px)').toBeLessThanOrEqual(budget.heroMaxPx);
      expect(m.heroHeight / height, 'hero height (share of the screen)').toBeLessThanOrEqual(budget.heroMaxVh);
      expect(m.ctaRows, 'rows of hero buttons').toBeLessThanOrEqual(budget.ctaMaxRows);
      expect(m.ctaOverlap, 'hero buttons overlap').toBe(false);
      expect(m.ctasInsideHero, 'hero buttons stay inside the hero').toBe(true);
    });

    test('the headline keeps its size and line count', async ({ page }) => {
      const m = await measure(page);
      expect(m.titleFontPx, 'headline font size (px)').toBeGreaterThan(19);
      expect(m.titleFontPx, 'headline font size (px)').toBeLessThanOrEqual(32);
      expect(m.titleLines, 'headline lines').toBeLessThanOrEqual(budget.titleMaxLines);
    });

    test('the tab bar shows on the first screen' + (budget.tabsFit ? ', every tab without scrolling' : ''), async ({ page }) => {
      const m = await measure(page);
      expect(m.tabsBottom, 'tab bar bottom edge vs screen height').toBeLessThanOrEqual(height);
      if (budget.tabsFit) expect(m.tabsScroll, 'tab bar overflow (px)').toBeLessThanOrEqual(0);
    });

    test('the page fits the screen and the content column is centered', async ({ page }) => {
      const m = await measure(page);
      expect(m.overflowX, 'horizontal page overflow (px)').toBeLessThanOrEqual(0);
      expect(Math.abs(m.mainLeft - m.mainRight), 'left vs right margin (px)').toBeLessThanOrEqual(2);
      // Up to the 1280px design width the column fills the screen (less its 16px gutters); beyond it, it stays at that width.
      expect(Math.abs(m.mainWidth - Math.min(m.layoutWidth - 32, 1248)), 'content column width (px)').toBeLessThanOrEqual(2);
    });

    test('Success Stories cards keep their size and their images keep their proportions', async ({ page }) => {
      const m = await measure(page);
      expect(m.storyHeight, 'story card height (px)').toBeLessThanOrEqual(budget.storyMaxPx);
      expect(Math.abs(m.imgAspect - 1), 'story image stretched or squashed').toBeLessThanOrEqual(0.02);
    });
  });
}
