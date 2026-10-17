import { test, expect, type Page, type Locator } from '@playwright/test';

// The Live Demo replays one CI/CD pipeline run on a loop: each stage goes
// queued -> running -> done while a pulse flows along the link into it, then
// the run finishes green and replays. The fake clock drives it (1.6 s per
// stage, 2.6 s on the finished state), so nothing waits real seconds.
const STAGES = 7;
const STEP_MS = 1600;
const RESULT_MS = 2600;

const states = (root: Locator) =>
  root.getByTestId('pipe-node').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
const linkStates = (root: Locator) =>
  root.getByTestId('pipe-link').evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
const progress = (root: Locator) =>
  root.getByTestId('pipe-progress').evaluate((e) => parseFloat((e as HTMLElement).style.width));

async function pauseClock(page: Page) {
  // install() leaves fake time flowing at real speed; pause it so only
  // runFor() moves the pipeline (a short margin, retried if already past).
  for (let attempt = 0; ; attempt++) {
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 300));
      return;
    } catch (e) {
      if (attempt >= 4 || !String(e).includes('past')) throw e;
    }
  }
}

test.describe('Guest home page — Live Demo pipeline motion', () => {
  let root: Locator;

  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    root = page.getByTestId('ai-live-demo-section').getByTestId('pipe-root');
    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-pipe-live', 'running');
    await pauseClock(page);
  });

  test('starts on the first stage, then advances stage by stage with the link flowing into it', async ({ page }) => {
    const step = root.getByTestId('pipe-step');
    // Up to one stage may already have passed during setup; start from where it is.
    const start = Number(await root.getAttribute('data-pipe-step'));
    expect(start).toBeLessThan(STAGES - 1);

    for (let i = start; i < start + 2; i++) {
      await expect(step).toHaveText(new RegExp(`^Step ${i + 1}/${STAGES} · `));
      const s = await states(root);
      expect(s.slice(0, i).every((x) => x === 'done')).toBe(true);
      expect(s[i]).toBe('active');
      expect(s.slice(i + 1).every((x) => x === 'queued')).toBe(true);
      const l = await linkStates(root);
      if (i > 0) expect(l[i - 1]).toBe('flowing');
      expect(l.slice(i).every((x) => x === 'idle')).toBe(true);
      await expect(root.getByTestId('pipe-node').nth(i).locator('[data-pipe-status]')).toHaveText('Running');

      const before = await progress(root);
      await page.clock.runFor(STEP_MS);
      await expect.poll(() => progress(root)).toBeGreaterThan(before);
    }
  });

  test('finishes green, then replays as the next run', async ({ page }) => {
    const step = root.getByTestId('pipe-step');
    await page.clock.runFor(STEP_MS * STAGES);
    await expect(step).toHaveText('✓ Pipeline green — merged');
    expect(await states(root)).toEqual(Array(STAGES).fill('done'));
    expect(await linkStates(root)).toEqual(Array(STAGES - 1).fill('done'));
    expect(await progress(root)).toBe(100);
    await expect(root.getByTestId('pipe-run')).toHaveText('Run #1');

    await page.clock.runFor(RESULT_MS);
    await expect(root.getByTestId('pipe-run')).toHaveText('Run #2');
    await expect(step).toHaveText(new RegExp(`^Step 1/${STAGES} · PR opened`));
    expect((await states(root))[0]).toBe('active');
    expect((await states(root)).slice(1).every((x) => x === 'queued')).toBe(true);
  });

  test('pauses while scrolled out of view, and resumes where it left off', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(root).toHaveAttribute('data-pipe-live', 'paused');
    const at = await root.getAttribute('data-pipe-step');
    await page.clock.runFor(STEP_MS * 3);
    expect(await root.getAttribute('data-pipe-step')).toBe(at);

    await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-pipe-live', 'running');
    await page.clock.runFor(STEP_MS);
    await expect(root).not.toHaveAttribute('data-pipe-step', at!);
  });

  test('keeps the running stage visible inside the row without scrolling the page', async ({ page }) => {
    const pageY = await page.evaluate(() => window.scrollY);
    await page.clock.runFor(STEP_MS * (STAGES - 1)); // the last stage, off the row's right edge at 1280px
    await expect(root).toHaveAttribute('data-pipe-step', String(STAGES - 1));
    // Polled: the row's smooth scroll runs in real time after the ticks.
    await expect.poll(() => root.evaluate((r) => {
      const row = r.querySelector('[data-pipe-row]')!.getBoundingClientRect();
      const a = r.querySelector('[data-state="active"]')!.getBoundingClientRect();
      return a.left >= row.left - 1 && a.right <= row.right + 1;
    })).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
  });

  test('the "See the pipeline" modal runs its own replay', async ({ page }) => {
    await page.getByTestId('ai-pipeline-demo-btn').click();
    const modal = page.getByTestId('ai-pipeline-demo').getByTestId('pipe-root');
    await expect(modal).toHaveAttribute('data-pipe-live', 'running');
    const at = Number(await modal.getAttribute('data-pipe-step'));
    await page.clock.runFor(STEP_MS);
    await expect(modal).toHaveAttribute('data-pipe-step', String(at + 1));
  });
});

test.describe('Guest home page — Live Demo pipeline, reduced motion', () => {
  test('shows the finished run, still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/#projects');
    await page.waitForLoadState('networkidle');
    const root = page.getByTestId('ai-live-demo-section').getByTestId('pipe-root');
    await expect(root).toHaveAttribute('data-pipe-mode', 'static');
    await expect(root.getByTestId('pipe-step')).toHaveText('✓ Pipeline green — merged');
    expect(await states(root)).toEqual(Array(STAGES).fill('done'));
    await page.clock.runFor(STEP_MS * 5);
    expect(await states(root)).toEqual(Array(STAGES).fill('done'));
  });
});
