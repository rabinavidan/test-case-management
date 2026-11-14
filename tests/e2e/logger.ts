/**
 * Structured step logger for Playwright TypeScript tests.
 *
 * Usage:
 *   import { log } from '../logger';
 *   log.step('Navigate to projects page');
 *   log.action('click', 'New Project button');
 *   log.assert('project card visible', 'My Project');
 *   log.info('arbitrary message');
 *   log.section('Suite CRUD');
 */

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const BLUE   = '\x1b[34m';

function ts(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;
}

export const log = {
  section(title: string): void {
    const bar = '─'.repeat(60);
    console.log(`\n${BOLD}${CYAN}${bar}${RESET}`);
    console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
    console.log(`${BOLD}${CYAN}${bar}${RESET}`);
  },

  step(description: string): void {
    console.log(`${BOLD}${BLUE}[${ts()}] STEP  ▶  ${description}${RESET}`);
  },

  action(verb: string, target: string, value?: string): void {
    const detail = value ? ` → '${value}'` : '';
    console.log(`${DIM}[${ts()}]      ${verb.toUpperCase().padEnd(8)}  ${target}${detail}${RESET}`);
  },

  assert(description: string, value?: string): void {
    const detail = value ? `: '${value}'` : '';
    console.log(`${GREEN}[${ts()}] ASSERT ✔  ${description}${detail}${RESET}`);
  },

  navigate(url: string): void {
    console.log(`${DIM}[${ts()}]      GOTO      ${url}${RESET}`);
  },

  info(msg: string): void {
    console.log(`[${ts()}] INFO   ${msg}`);
  },

  warn(msg: string): void {
    console.log(`${YELLOW}[${ts()}] WARN   ${msg}${RESET}`);
  },

  error(msg: string): void {
    console.log(`${RED}[${ts()}] ERROR  ${msg}${RESET}`);
  },
};
