import { test, expect } from '../fixtures/auth.fixture';

// Human review of AI drafts (course milestone M9), through the real backend.
// Only the generate call is mocked - there's no AI provider in tests - with
// the drafts the model "returned"; reviewing, saving and recording each
// verdict all go through the real API.

const DRAFTS = [
  { title: 'Login with valid credentials', description: 'Happy path', steps: 'Enter user and password', expected_result: 'Dashboard loads', priority: 'high' },
  { title: 'Login wiht wrong pasword', description: 'Typo in the title', steps: 'Enter a wrong password', expected_result: 'Error shown', priority: 'medium' },
  { title: 'Login works', description: 'Too vague to test', steps: null, expected_result: null, priority: 'low' },
];

test.describe('AI drafts — human review', () => {
  let tag: string;
  let suiteId: number;

  test.beforeEach(async ({ page, authToken, authedRequest }, testInfo) => {
    tag = `Review_${Date.now()}_${testInfo.workerIndex}_${testInfo.repeatEachIndex}`;
    const project = await (await authedRequest.post('/api/projects', { data: { name: `${tag} project` } })).json();
    suiteId = (await (await authedRequest.post(`/api/projects/${project.id}/suites`, { data: { name: `${tag} suite` } })).json()).id;
    await page.route((url) => url.pathname === `/api/suites/${suiteId}/testcases/generate`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ test_cases: DRAFTS, model: 'claude-haiku-4-5' }) }));
    await page.addInitScript((t) => localStorage.setItem('tf_token', t), authToken);
  });

  test.afterEach(async ({ authedRequest }) => {
    const { items } = await (await authedRequest.get('/api/projects', { params: { search: tag, page_size: 100 } })).json();
    for (const p of items.filter((p: { name: string }) => p.name.startsWith(tag))) {
      await authedRequest.delete(`/api/projects/${p.id}`);
    }
  });

  test('accept, edit and reject drafts; kept ones are saved and every verdict is recorded', async ({ page, authedRequest }) => {
    // Reviews outlive their suite, and SQLite reuses a deleted suite's id, so
    // this run's reviews are told apart by their (unique) feature description.
    const feature = `User login, including lockout after failed attempts (${tag})`;
    const mine = async () => ((await (await authedRequest.get('/api/ai/reviews', { params: { suite_id: suiteId } })).json()) as Array<Record<string, any>>)
      .filter((r) => r.feature_description === feature);
    await page.goto(`/#suite/${suiteId}`);
    await page.getByRole('button', { name: 'Generate with AI' }).click();
    await page.locator('#ai-desc').fill(feature);
    await page.locator('#ai-generate-btn').click();

    const drafts = page.getByTestId('ai-draft');
    await expect(drafts).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(page.getByTestId(`ai-verdict-${i}-accepted`)).toHaveAttribute('aria-pressed', 'true');

    // Draft 2: fix the typo. Draft 3: reject it.
    await page.getByTestId('ai-verdict-1-edited').click();
    await page.getByTestId('ai-edit-title-1').fill('Login with a wrong password shows an error');
    await page.getByTestId('ai-verdict-2-rejected').click();
    await expect(page.getByTestId('ai-reject-reason-2')).toBeFocused();

    // A rejection without a reason is stopped before anything is sent.
    await page.getByTestId('ai-review-submit').click();
    await expect(page.getByTestId('ai-review-error')).toContainText('Draft 3 is rejected');
    expect(await mine()).toEqual([]);

    await page.getByTestId('ai-reject-reason-2').fill('Too vague: ignores lockout and the wrong-password error');
    await page.getByTestId('ai-reject-cover-2').fill('lockout, wrong password');
    await page.getByTestId('ai-review-submit').click();
    await expect(page.getByTestId('toast-inner')).toContainText('2 saved as drafts, 1 rejected');
    await expect(page.getByTestId('modal-overlay')).toHaveClass(/hidden/);

    // The suite now holds the accepted draft and the edited one, as drafts.
    await expect(page.locator('[data-testid^="testcase-card-"]').filter({ hasText: DRAFTS[0].title })).toBeVisible();
    await expect(page.locator('[data-testid^="testcase-card-"]').filter({ hasText: 'Login with a wrong password shows an error' })).toBeVisible();
    await expect(page.locator('[data-testid^="testcase-card-"]').filter({ hasText: 'Login works' })).toHaveCount(0);

    const reviews = await mine();
    const by = Object.fromEntries(reviews.map((r) => [r.verdict, r]));
    expect(Object.keys(by).sort()).toEqual(['accepted', 'edited', 'rejected']);
    expect(by.edited.output.title).toBe(DRAFTS[1].title);
    expect(by.edited.edited.title).toBe('Login with a wrong password shows an error');
    expect(by.rejected.reason).toBe('Too vague: ignores lockout and the wrong-password error');
    expect(by.rejected.must_cover).toEqual(['lockout', 'wrong password']);
    expect(by.rejected.test_case_id).toBeNull();
    for (const r of reviews) {
      expect(r.model).toBe('claude-haiku-4-5');
      expect(r.reviewer).toBe('testuser_e2e');
    }
  });
});
