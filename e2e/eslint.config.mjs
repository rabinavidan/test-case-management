// Layering rules for the Playwright suite (e2e/README.md, "Test architecture").
//
//   tests/*.spec.ts ─▶ flows/ ─▶ pages/ ─▶ Playwright Page
//                  └─▶ api/  ─▶ Playwright APIRequestContext
//   data/ (types + builders) is shared by every layer and depends on none.
//
// This file is the enforcement: a spec that reaches for a selector, a URL or
// a raw HTTP call fails `npm run lint` in CI, and so does a layer importing
// the wrong way. Only lint rules are configured here (no style rules), so
// every error is an architecture error.
import tsParser from '@typescript-eslint/parser';
import { LEGACY_SPECS } from './eslint.legacy-specs.mjs';

const PAGE_HANDLE = '/^(page|signedInPage|alice|bob)$/';
const UI_CALLS =
  '/^(locator|getBy\\w+|click|dblclick|fill|check|uncheck|press|type|hover|selectOption|textContent|innerText|isVisible|waitForSelector|\\$|\\$\\$|\\$eval|\\$\\$eval|request)$/';

const specRules = [
  {
    selector: `MemberExpression[object.name=${PAGE_HANDLE}][property.name=${UI_CALLS}]`,
    message: 'Selectors and UI actions belong in a page object (e2e/pages); call its methods/locators instead.',
  },
  {
    selector: `MemberExpression[object.property.name='page'][property.name=${UI_CALLS}]`,
    message: 'Selectors and UI actions belong in a page object (e2e/pages); `app.page` is for page-level assertions only.',
  },
  {
    selector: "CallExpression[callee.object.name=/^(request|authedRequest)$/][callee.property.name=/^(get|post|put|patch|delete|head|fetch)$/]",
    message: 'HTTP calls belong in e2e/api; use the `api` fixture (and a flow for multi-step setup).',
  },
  {
    selector: 'Literal[value=/^\\/api\\//]',
    message: 'Backend URLs live in e2e/api/routes.ts only.',
  },
  {
    selector: 'TemplateElement[value.raw=/^\\/api\\//]',
    message: 'Backend URLs live in e2e/api/routes.ts only.',
  },
  {
    selector: "CallExpression[callee.property.name='waitForLoadState']",
    message: "Don't wait on network state in a spec; page objects own readiness (BasePage.waitForView).",
  },
  {
    selector: "CallExpression[callee.property.name='waitForTimeout']",
    message: 'No fixed sleeps; wait on a condition (web-first assertion or a page-object wait).',
  },
  {
    selector: "LogicalExpression[operator='||'] > Literal.right[value=true]",
    message: '`|| true` makes the expression always true; an assertion built on it can never fail.',
  },
  {
    selector: "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression > Literal.body[value=false]",
    message: '`.catch(() => false)` turns a failure into a silent branch; assert the state you expect instead.',
  },
];

const restrictImports = (...groups) => ['error', {
  patterns: groups.map(([group, message]) => ({ group, message })),
}];

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
  },

  // Specs: describe behaviour; no selectors, URLs, raw HTTP or hidden failures.
  {
    files: ['tests/**/*.spec.ts'],
    ignores: LEGACY_SPECS,
    rules: { 'no-restricted-syntax': ['error', ...specRules] },
  },

  // flows/: compose pages and api; never assert (the spec owns the verdict).
  {
    files: ['flows/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "ImportSpecifier[imported.name='expect']", message: 'Flows return state; assertions belong in the spec.' },
        { selector: 'Literal[value=/^\\/api\\//]', message: 'Backend URLs live in e2e/api/routes.ts only.' },
        { selector: 'TemplateElement[value.raw=/^\\/api\\//]', message: 'Backend URLs live in e2e/api/routes.ts only.' },
      ],
      'no-restricted-imports': restrictImports(
        [['**/tests/**', '**/fixtures/**'], 'flows/ sits below specs and fixtures and must not import them.'],
      ),
    },
  },

  // pages/: UI only — no HTTP, no knowledge of flows, fixtures or the api layer.
  {
    files: ['pages/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: 'Literal[value=/^\\/api\\//]', message: 'Page objects drive the UI; HTTP belongs in e2e/api.' },
        { selector: 'TemplateElement[value.raw=/^\\/api\\//]', message: 'Page objects drive the UI; HTTP belongs in e2e/api.' },
        { selector: "CallExpression[callee.property.name='waitForTimeout']", message: 'No fixed sleeps; wait on a condition.' },
      ],
      'no-restricted-imports': restrictImports(
        [['**/api/**', '**/flows/**', '**/fixtures/**', '**/tests/**', '**/mocks/**'], 'pages/ is the UI layer: it may import only data/ and the logger.'],
      ),
    },
  },

  // api/: HTTP only — no UI.
  {
    files: ['api/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        [['**/pages/**', '**/flows/**', '**/fixtures/**', '**/tests/**'], 'api/ is the HTTP layer: it may import only data/.'],
      ),
    },
  },

  // data/: the shared vocabulary depends on nothing else in the suite.
  {
    files: ['data/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        [['**/pages/**', '**/flows/**', '**/fixtures/**', '**/tests/**', '**/api/**'], 'data/ is the bottom layer and imports nothing from the suite.'],
      ),
    },
  },

  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'allure-*/**', 'blob-report/**'] },
];
