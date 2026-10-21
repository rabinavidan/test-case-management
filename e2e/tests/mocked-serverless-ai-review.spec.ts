import { test, expect, Page, Route } from '@playwright/test';
import { SuitePage } from '../pages/suite.page';
import {
  mockAIDraftReview,
  mockAIGeneratedTestCase,
  mockAIGenerateResponse,
  mockProject,
  mockProjectList,
  mockSuite,
} from '../mocks/factories';
import { fulfillJson, mockAuthSession, byPath, mockParentLookups } from '../mocks/route-helpers';

/**
 * Human review of AI drafts (course milestone M9) on the suite page, against
 * a mocked backend — see e2e/README.md's "Serverless mocked E2E tests". The
 * real API side (verdict rules, export, prompt feedback) is covered by
 * tests/api/test_ai_review.py; this pins what the reviewer sees and what the
 * page sends.
 */

async function mockSuitePage(page: Page, reviews: ReturnType<typeof mockAIDraftReview>[]) {
  await mockAuthSession(page);
  const project = mockProject({ name: 'Review Project' });
  const suite = mockSuite({ project_id: project.id, name: 'Checkout' });
  await page.route(byPath('/api/projects'), (route) => fulfillJson(route, 200, mockProjectList([project])));
  await page.route(byPath(`/api/projects/${project.id}/suites`), (route) => fulfillJson(route, 200, [suite]));
  await mockParentLookups(page, [project], [suite]);
  await page.route(byPath(`/api/suites/${suite.id}/testcases`), (route) => fulfillJson(route, 200, []));
  await page.route(byPath(`/api/suites/${suite.id}/runs`), (route) => fulfillJson(route, 200, []));

  let pending = reviews.map((r) => ({ ...r, suite_id: suite.id }));
  const decisions: { id: number; body: any }[] = [];
  await page.route(byPath(`/api/suites/${suite.id}/ai-reviews`), (route) => fulfillJson(route, 200, pending));
  await page.route(
    (url) => /^\/api\/ai-reviews\/\d+$/.test(url.pathname),
    async (route: Route) => {
      const id = Number(new URL(route.request().url()).pathname.split('/').pop());
      const body = route.request().postDataJSON();
      decisions.push({ id, body });
      const review = pending.find((r) => r.id === id)!;
      pending = pending.filter((r) => r.id !== id);
      await fulfillJson(route, 200, { ...review, verdict: body.verdict, reason: body.reason ?? null });
    },
  );
  return { suite, decisions };
}

test.describe('AI draft review — serverless', () => {
  test('pending drafts are listed on the suite page with who generated them from what', async ({ page }) => {
    const review = mockAIDraftReview({ original: mockAIGeneratedTestCase({ title: 'Coupon below minimum is refused' }) });
    const { suite } = await mockSuitePage(page, [review]);

    await new SuitePage(page).goto(suite.id);

    const panel = page.getByTestId('ai-review-panel');
    await expect(panel).toContainText('1 AI draft awaiting review');
    await expect(panel.getByTestId(`ai-review-${review.id}`)).toContainText('Coupon below minimum is refused');
    await expect(panel).toContainText('User login with email and password');
  });

  test('no panel when nothing is pending', async ({ page }) => {
    const { suite } = await mockSuitePage(page, []);
    await new SuitePage(page).goto(suite.id);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByTestId('ai-review-panel')).toHaveCount(0);
  });

  test('accepting a draft sends the verdict and removes it from the panel', async ({ page }) => {
    const [a, b] = [mockAIDraftReview(), mockAIDraftReview()];
    const { suite, decisions } = await mockSuitePage(page, [a, b]);
    await new SuitePage(page).goto(suite.id);

    await page.getByTestId(`ai-review-accept-${a.id}`).click();

    await expect(page.getByTestId('ai-review-panel')).toContainText('1 AI draft awaiting review');
    await expect(page.getByTestId(`ai-review-${a.id}`)).toHaveCount(0);
    expect(decisions).toEqual([{ id: a.id, body: { verdict: 'accepted' } }]);
  });

  test('rejecting requires a reason, then sends it', async ({ page }) => {
    const review = mockAIDraftReview();
    const { suite, decisions } = await mockSuitePage(page, [review]);
    await new SuitePage(page).goto(suite.id);

    await page.getByTestId(`ai-review-reject-${review.id}`).click();
    await page.getByTestId('ai-reject-confirm').click();
    await expect(page.locator('#ai-review-error')).toContainText('Please say why');
    expect(decisions).toEqual([]);

    await page.locator('#ai-reject-reason').fill('Duplicates TC-12');
    await page.getByTestId('ai-reject-confirm').click();

    await expect(page.getByTestId('ai-review-panel')).toHaveCount(0);
    expect(decisions).toEqual([{ id: review.id, body: { verdict: 'rejected', reason: 'Duplicates TC-12' } }]);
  });

  test('editing sends only the changed fields', async ({ page }) => {
    const review = mockAIDraftReview({ original: mockAIGeneratedTestCase({ title: 'Login works', priority: 'medium' }) });
    const { suite, decisions } = await mockSuitePage(page, [review]);
    await new SuitePage(page).goto(suite.id);

    await page.getByTestId(`ai-review-edit-${review.id}`).click();
    await page.locator('#ai-edit-title').fill('Login succeeds with valid credentials');
    await page.locator('#ai-edit-priority').selectOption('high');
    await page.getByTestId('ai-edit-confirm').click();

    await expect(page.getByTestId('ai-review-panel')).toHaveCount(0);
    expect(decisions).toEqual([{
      id: review.id,
      body: { verdict: 'edited', edits: { title: 'Login succeeds with valid credentials', priority: 'high' } },
    }]);
  });

  test('saving generated drafts passes the generation_id along', async ({ page }) => {
    const { suite } = await mockSuitePage(page, []);
    const generated = mockAIGenerateResponse({ generation_id: 'feedfacefeedfacefeedfacefeedface' });
    await page.route(
      (url) => url.pathname === `/api/suites/${suite.id}/testcases/generate`,
      (route) => fulfillJson(route, 200, generated),
    );
    let saveUrl = '';
    await page.route(
      (url) => url.pathname === `/api/suites/${suite.id}/testcases/generate/save`,
      (route) => { saveUrl = route.request().url(); return fulfillJson(route, 200, { saved: 1, review_ids: [1] }); },
    );

    await new SuitePage(page).goto(suite.id);
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    await page.locator('#ai-desc').fill('Coupons at checkout');
    await page.locator('#ai-generate-btn').click();
    await page.getByRole('button', { name: 'Save All' }).click();

    await expect.poll(() => saveUrl).toContain('generation_id=feedfacefeedfacefeedfacefeedface');
  });
});
