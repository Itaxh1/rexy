// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Markdown, splitFrontmatter } from './markdown';
import ProjectsPage from './Projects';
import ProjectsPanel, { codePoints, skillBody, slug } from './ProjectsPanel';
import { SKILL_LIMIT, projects as publicDemo, type Project } from './projects.stub';

// Synthetic interaction fixtures, never excerpts from real conversations.
function example(name: string, sessions: number, generated = false, questions = false): Project {
  return {name,sessions,days:3,prompts:8,firstActive:'2026-09-14',lastActive:'2026-09-16',agents:'Codex',
    docs:generated ? {model:'grok-4.3',generatedAt:'2026-09-16',sessionsCovered:sessions,
      questions:questions ? [{id:'color',subject:'Color',options:[{date:'Apr 25',quote:'Use dark buttons'},{date:'Apr 27',quote:'Use light buttons'}]}] : [],
      projectMd:`# ${name}\n\n## Where things are\n- src/\n\n## How to check work\n- Run \`npm run build\`\n\n## Decisions\n- Check the browser. _Apr 27_\n\n## Open questions\n- Color?\n\n## History\n- Synthetic test\n`,
      skillMd:`---\nname: rexy-${slug(name)}\ndescription: Synthetic test context.\n---\n\nCheck requested behavior in a browser.\n`} : undefined};
}
const projects = [example('poc-10',5,true),example('landing-page-v2',15,true,true),example('landing-frontend',1),example('Leads',1)];
const projectsTotal = projects.length;

let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const mount = (list: Project[] = projects) =>
  act(async () => root.render(<ProjectsPanel projects={list} total={projectsTotal} />));
const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.pj-pitem'));
const item = (name: string) => items().find(b => b.querySelector('.pj-pname')?.textContent === name)!;
const state = (name: string) => item(name).querySelector('.pj-pstate')!.getAttribute('data-state');
const button = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === label)!;
const click = (el: HTMLElement) => act(async () => el.click());
const key = (el: Element, k: string) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
const docsOf = (name: string) => projects.find(p => p.name === name)!.docs!;

describe('generated project files (stub)', () => {
  const generated = projects.filter(p => p.docs);

  it('names each SKILL.md rexy-<project> and keeps its body within the limit', () => {
    expect(generated.length).toBeGreaterThan(0);
    for (const p of generated) {
      const { meta, body } = splitFrontmatter(p.docs!.skillMd);
      const front = Object.fromEntries(meta);
      expect(front.name).toBe(`rexy-${slug(p.name)}`);
      expect(front.description).toBeTruthy();
      expect(front.description).not.toMatch(/: /); // stays a plain YAML scalar
      expect(codePoints(body.trim())).toBeLessThanOrEqual(SKILL_LIMIT);
    }
  });

  it('dates every decision and never claims more sessions than exist', () => {
    for (const p of generated) {
      const decisions = p.docs!.projectMd.split('## Decisions\n')[1]!.split('\n\n')[0]!.split('\n');
      expect(decisions.length).toBeGreaterThan(0);
      for (const line of decisions) expect(line).toMatch(/^- .+ _[A-Z][a-z]{2} \d{1,2}_$/);
      expect(p.docs!.sessionsCovered).toBeLessThanOrEqual(p.sessions);
    }
  });
});

describe('<Markdown>', () => {
  it('renders headings, lists, code, strong and dates as elements', async () => {
    await act(async () => root.render(
      <Markdown text={'# Title\n\nIntro line\n\n## Decisions\n- Use `npm run build`. _Apr 24_\n- **Never** push'} />,
    ));
    expect(container.querySelector('h3')?.textContent).toBe('Title');
    expect(container.querySelector('p')?.textContent).toBe('Intro line');
    expect(container.querySelector('h4')?.textContent).toBe('Decisions');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('li code')?.textContent).toBe('npm run build');
    expect(container.querySelector('li em')?.textContent).toBe('Apr 24');
    expect(container.querySelector('li strong')?.textContent).toBe('Never');
  });

  it('keeps underscores in paths and never turns model text into HTML', async () => {
    await act(async () => root.render(
      <Markdown text={'- admin_panel/src/main.ts <img src=x onerror="alert(1)"> [docs](javascript:alert(1))'} />,
    ));
    expect(container.querySelector('em, img, a')).toBeNull();
    expect(container.querySelector('li')?.textContent).toContain('admin_panel/src/main.ts <img src=x');
  });
});

describe('<ProjectsPage>', () => {
  it('is its own page: one panel with a title bar, the list and the reader', async () => {
    await act(async () => root.render(<ProjectsPage />));
    const app = container.querySelector('main.pj > .panel.pj-app')!;
    expect(app.querySelector(':scope > .pj-head h1')?.textContent).toBe('Projects');
    expect(app.querySelector('.pj-head p')?.textContent).toContain('PROJECT.md for you and a SKILL.md for Claude Code and Codex');
    expect(app.querySelectorAll('.pj-pitem')).toHaveLength(publicDemo.length);
    expect(app.querySelector('.pj-reader h2')?.textContent).toBe('Example dashboard');
  });
});

describe('<ProjectsPanel>', () => {
  it('says what each project has', async () => {
    await mount();
    expect(container.querySelector('.pj-plist-h')?.textContent).toContain(`${projects.length} of ${projectsTotal} projects`);
    expect(state('landing-page-v2')).toBe('question');
    expect(item('landing-page-v2').textContent).toContain('1 question');
    expect(state('poc-10')).toBe('ready');
    expect(item('poc-10').textContent).toContain('Ready');
    expect(state('Leads')).toBe('none');
    expect(item('Leads').textContent).toContain('Not generated');
  });

  it('opens the project that needs an answer and reads PROJECT.md as a document', async () => {
    await mount();
    expect(item('landing-page-v2').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.pj-gen')?.textContent).toBe('Written by Grok (grok-4.3) on Sep 16, 2026 from all 15 sessions.');
    const doc = container.querySelector('#pj-file .pj-md')!;
    expect(doc.querySelector('h3')?.textContent).toBe('landing-page-v2');
    expect(Array.from(doc.querySelectorAll('h4'), h => h.textContent))
      .toEqual(['Where things are', 'How to check work', 'Decisions', 'Open questions', 'History']);
    expect(Array.from(doc.querySelectorAll('code'), c => c.textContent)).toContain('npm run build');
    expect(container.querySelector('#pj-file pre')).toBeNull();
  });

  it('shows SKILL.md with its frontmatter, length and install path, and the exact source', async () => {
    await mount();
    const docs = docsOf('landing-page-v2');
    await click(button('SKILL.md'));
    expect(container.querySelector('.pj-front dd')?.textContent).toBe('rexy-landing-page-v2');
    expect(container.querySelector('.pj-count')?.textContent).toBe(`${codePoints(skillBody(docs.skillMd))} / ${SKILL_LIMIT} characters`);
    expect(container.querySelector('.pj-purpose')?.textContent).toContain('after you save it to their skills folder');
    expect(container.querySelector('.pj-install')?.textContent).toContain('~/.claude/skills/rexy-landing-page-v2/SKILL.md');
    await click(button('Source'));
    expect(container.querySelector('#pj-file pre')?.textContent).toBe(docs.skillMd);
  });

  it('keeps headers fixed: only the list and the open file scroll', async () => {
    await mount();
    const list = container.querySelector('.pj-ptabs')!;
    const body = container.querySelector('.pj-rbody')!;
    expect(list.classList.contains('pj-scroll') && body.classList.contains('pj-scroll')).toBe(true);
    expect(list.contains(container.querySelector('.pj-plist-h'))).toBe(false);
    expect(body.contains(container.querySelector('.pj-rhead'))).toBe(false);
    expect(body.contains(container.querySelector('.pj-filebar'))).toBe(false);
    expect(body.contains(container.querySelector('#pj-file'))).toBe(true);
    expect(body.contains(container.querySelector('.pj-question'))).toBe(true);
  });

  it('opens every project and file at the top of the reader', async () => {
    await mount();
    const body = container.querySelector<HTMLElement>('.pj-rbody')!;
    let top = 480;
    Object.defineProperty(body, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    await click(item('poc-10'));
    expect(top).toBe(0);
    top = 480;
    await click(button('SKILL.md'));
    expect(top).toBe(0);
  });

  it('counts the SKILL.md limit in characters, not UTF-16 units', () => {
    expect(codePoints('a😀b')).toBe(3);
    expect('a😀b'.length).toBe(4);
  });

  it('moves between projects and files with arrow keys', async () => {
    await mount();
    await key(item('landing-page-v2'), 'ArrowDown');
    expect(item('landing-frontend').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(item('landing-frontend'));
    await key(item('landing-frontend'), 'ArrowUp');
    await key(item('landing-page-v2'), 'ArrowUp');
    expect(item('poc-10').getAttribute('aria-selected')).toBe('true');
    await key(container.querySelector('#pj-file-project')!, 'ArrowRight');
    expect(container.querySelector('#pj-file-skill')?.getAttribute('aria-selected')).toBe('true');
  });

  it('records which instruction still applies, and can undo it', async () => {
    await mount();
    const options = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.pj-option'));
    await click(options()[1]!);
    expect(options()[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.pj-question [role=status]')?.textContent).toContain('Apr 27 applies');
    expect(state('landing-page-v2')).toBe('ready');
    await click(button('Undo'));
    expect(container.querySelector('.pj-question [role=status]')).toBeNull();
    expect(state('landing-page-v2')).toBe('question');
  });

  it('queues Grok for a project without files, and can cancel', async () => {
    await mount();
    await click(item('Leads'));
    expect(container.querySelector('.pj-empty h3')?.textContent).toBe('No files yet');
    expect(container.querySelector('.pj-empty')?.textContent).toContain('Tool output is never sent');
    await click(button('Generate with Grok'));
    expect(state('Leads')).toBe('queued');
    expect(container.querySelector('.pj-queued')?.textContent).toContain('Grok is writing PROJECT.md and SKILL.md from 1 session.');
    expect(button('Generate with Grok')).toBeUndefined();
    await click(button('Cancel'));
    expect(state('Leads')).toBe('none');
  });

  it('flags files written before the latest sessions', async () => {
    const poc = projects.find(p => p.name === 'poc-10')!;
    await mount([{ ...poc, sessions: 7 }]);
    expect(item('poc-10').textContent).toContain('2 new sessions');
    expect(container.querySelector('.pj-gen')?.textContent).toContain('from 5 of 7 sessions');
  });

  it('copies the raw file text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await mount();
    await click(button('Copy'));
    expect(writeText).toHaveBeenCalledWith(docsOf('landing-page-v2').projectMd);
    expect(button('Copied')).toBeDefined();
  });
});
