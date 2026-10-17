import { test as guestTest, expect as guestExpect } from '@playwright/test';
import { test as authTest, expect as authExpect } from '../fixtures/auth.fixture';

// The Success Stories carousel: six of the owner's LinkedIn posts, shown
// right after the hero for guests. Images are self-hosted WebP copies.
const POSTS = [
  '7511122582864203777', '7480988116976254977', '7479141849790701568',
  '7475895553185308672', '7474467230747877376', '7474123893595877376',
];

guestTest.describe('Guest home page — Success Stories carousel', () => {
  guestTest.beforeEach(async ({ page }) => {
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
  });

  guestTest('sits right after the hero and before the Live Demo section', async ({ page }) => {
    // networkidle can arrive before renderProjects() has written the page.
    await guestExpect(page.getByTestId('ai-live-demo-section')).toBeVisible();
    const order = await page.evaluate(() => {
      const ids = ['.owner-banner', '[data-testid="success-stories-section"]', '[data-testid="ai-live-demo-section"]'];
      const [hero, stories, demo] = ids.map((s) => document.querySelector(s));
      if (!hero || !stories || !demo) return 'missing';
      const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return after(hero, stories) && after(stories, demo) ? 'ok' : 'out of order';
    });
    guestExpect(order).toBe('ok');
    await guestExpect(page.getByRole('heading', { name: 'Success Stories' })).toBeVisible();
  });

  guestTest('shows six stories, each linking to its LinkedIn post with real alt text', async ({ page }) => {
    const slides = page.getByTestId('story-slide');
    await guestExpect(slides).toHaveCount(POSTS.length);

    for (let i = 0; i < POSTS.length; i++) {
      const slide = slides.nth(i);
      await guestExpect(slide).toHaveAttribute('aria-label', new RegExp(`^${i + 1} of ${POSTS.length}: `));
      const link = slide.getByTestId('story-link');
      await guestExpect(link).toHaveAttribute('href', `https://www.linkedin.com/feed/update/urn:li:activity:${POSTS[i]}/`);
      await guestExpect(link).toHaveAttribute('target', '_blank');
      await guestExpect(link).toHaveAttribute('rel', /noopener/);
      const alt = await slide.locator('img').getAttribute('alt');
      guestExpect(alt?.length ?? 0).toBeGreaterThan(40);
      guestExpect(alt).not.toMatch(/no alternative text/i);
    }
  });

  guestTest('every image is served from this site as WebP', async ({ page }) => {
    const srcs = await page.getByTestId('story-slide').locator('img').evaluateAll(
      (imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src')!),
    );
    guestExpect(srcs).toHaveLength(POSTS.length);
    for (const src of srcs) {
      guestExpect(src).toMatch(/^\/static\/img\/success-stories\/[a-z-]+\.webp$/);
      const res = await page.request.get(src);
      guestExpect(res.status(), src).toBe(200);
      guestExpect(res.headers()['content-type'], src).toBe('image/webp');
    }
  });

  guestTest('Next, Previous, the dots and the arrow keys move through the stories', async ({ page }) => {
    // Reduced motion turns auto-advance off, so only these controls move the track.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForLoadState('networkidle');
    const track = page.getByTestId('stories-track');
    const prev = page.getByTestId('stories-prev');
    const next = page.getByTestId('stories-next');
    const dots = page.getByTestId('stories-dots').getByRole('button');
    const scrollLeft = () => track.evaluate((t) => t.scrollLeft);

    await guestExpect(dots).toHaveCount(POSTS.length);
    await guestExpect(prev).toBeDisabled();
    await guestExpect(dots.first()).toHaveAttribute('aria-current', 'true');

    await next.click();
    await guestExpect.poll(scrollLeft).toBeGreaterThan(0);
    await guestExpect(prev).toBeEnabled();

    await prev.click();
    await guestExpect.poll(scrollLeft).toBe(0);

    await dots.last().click();
    await guestExpect(next).toBeDisabled();
    await guestExpect(dots.last()).toHaveAttribute('aria-current', 'true');

    await dots.first().click();
    await guestExpect.poll(scrollLeft).toBe(0);
    await track.focus();
    await page.keyboard.press('ArrowRight');
    await guestExpect.poll(scrollLeft).toBeGreaterThan(0);
  });
});

// Auto-advance runs on a 5 s setInterval; the fake clock fast-forwards it
// so these tests neither wait real seconds nor race the timer.
guestTest.describe('Guest home page — Success Stories auto-advance', () => {
  const INTERVAL = 5000;

  guestTest.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await guestExpect(page.getByTestId('success-stories-section')).toBeVisible();
    await page.mouse.move(0, 0); // keep the pointer off the carousel
    // install() leaves fake time flowing at real speed, so a slow run could
    // fire a tick on its own; pause it so only runFor() moves time. The target
    // must still be in the future when pauseAt runs, and fast-forwarding to it
    // must not reach the first 5 s tick: a short margin, retried if too short.
    for (let attempt = 0; ; attempt++) {
      try {
        await page.clock.pauseAt(await page.evaluate(() => Date.now() + 300));
        break;
      } catch (e) {
        if (attempt >= 4 || !String(e).includes('past')) throw e;
      }
    }
  });

  const scrollLeft = (page: import('@playwright/test').Page) =>
    page.getByTestId('stories-track').evaluate((t) => t.scrollLeft);
  // The scroll position once a smooth scroll has stopped moving (NaN while it
  // still is, which fails any numeric poll and makes it retry).
  const settledScrollLeft = async (page: import('@playwright/test').Page) => {
    const a = await scrollLeft(page);
    await page.waitForTimeout(150);
    const b = await scrollLeft(page);
    return a === b ? b : NaN;
  };
  const atEnd = (page: import('@playwright/test').Page) =>
    page.getByTestId('stories-track').evaluate((t) => t.scrollLeft + t.clientWidth >= t.scrollWidth - 2);

  guestTest('advances on its own and loops back to the first story', async ({ page }) => {
    const section = page.getByTestId('success-stories-section');
    await guestExpect(section).toHaveAttribute('data-autoplay', 'running');
    guestExpect(await scrollLeft(page)).toBe(0);

    // Ticks to reach the end = stories whose start the track can scroll to,
    // minus the first (when several fit on screen, the last few share one end).
    const ticksToEnd = await page.getByTestId('stories-track').evaluate((t) => {
      const max = t.scrollWidth - t.clientWidth;
      const base = (t.children[0] as HTMLElement).offsetLeft;
      return [...t.children].filter((c) => (c as HTMLElement).offsetLeft - base <= max + 2).length - 1;
    });
    guestExpect(ticksToEnd).toBeGreaterThan(0);

    for (let i = 1; i <= ticksToEnd; i++) {
      const before = await scrollLeft(page);
      await page.clock.runFor(i === 1 ? INTERVAL + 100 : INTERVAL);
      // Settled, not just started: the next tick must not race this scroll.
      await guestExpect.poll(() => settledScrollLeft(page)).toBeGreaterThan(before);
    }
    guestExpect(await atEnd(page)).toBe(true);

    await page.clock.runFor(INTERVAL);
    await guestExpect.poll(() => settledScrollLeft(page)).toBe(0);
  });

  guestTest('pauses while the pointer is over the carousel, and resumes after', async ({ page }) => {
    const section = page.getByTestId('success-stories-section');
    await page.getByTestId('stories-track').hover();
    await guestExpect(section).toHaveAttribute('data-autoplay', 'paused');
    await page.clock.runFor(INTERVAL * 3);
    guestExpect(await scrollLeft(page)).toBe(0);

    await page.mouse.move(0, 0);
    await guestExpect(section).toHaveAttribute('data-autoplay', 'running');
    await page.clock.runFor(INTERVAL + 100);
    await guestExpect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
  });

  guestTest('pauses while keyboard focus is inside the carousel', async ({ page }) => {
    await page.getByTestId('stories-track').focus();
    await guestExpect(page.getByTestId('success-stories-section')).toHaveAttribute('data-autoplay', 'paused');
    await page.clock.runFor(INTERVAL * 3);
    guestExpect(await scrollLeft(page)).toBe(0);
  });

  guestTest('the Pause button stops it until Play is pressed', async ({ page }) => {
    const section = page.getByTestId('success-stories-section');
    const toggle = page.getByTestId('stories-autoplay');
    await guestExpect(toggle).toHaveAttribute('aria-label', 'Pause auto-advance');

    await toggle.click();
    await page.mouse.move(0, 0);
    await guestExpect(toggle).toHaveAttribute('aria-label', 'Play auto-advance');
    await guestExpect(section).toHaveAttribute('data-autoplay', 'paused');
    await page.clock.runFor(INTERVAL * 3);
    guestExpect(await scrollLeft(page)).toBe(0);

    await toggle.click();
    await page.mouse.move(0, 0);
    await guestExpect(toggle).toHaveAttribute('aria-label', 'Pause auto-advance');
    await guestExpect(section).toHaveAttribute('data-autoplay', 'running');
    await page.clock.runFor(INTERVAL + 100);
    await guestExpect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
  });

  guestTest('never moves on its own for visitors who prefer reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await guestExpect(page.getByTestId('success-stories-section')).toBeVisible();
    await guestExpect(page.getByTestId('stories-autoplay')).toBeHidden();
    await page.clock.runFor(INTERVAL * 3);
    guestExpect(await scrollLeft(page)).toBe(0);
  });
});

authTest.describe('Signed-in home page — Success Stories is guest-only', () => {
  authTest('does not show for a signed-in user', async ({ page, authToken }) => {
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    await authExpect(page.getByTestId('success-stories-section')).toHaveCount(0);
  });
});
