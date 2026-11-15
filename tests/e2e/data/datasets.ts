/**
 * Input data for data-driven specs: one test per row, so adding a case is a
 * data change, not a code change. Typed against data/types.ts, so a value the
 * app doesn't support fails `tsc` instead of failing at runtime.
 */
import type { Priority } from './types';

/** Every priority a test case can have, as the suite page labels it. */
export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const satisfies readonly Priority[];
