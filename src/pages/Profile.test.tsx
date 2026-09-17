// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ProfilePage from './Profile';
import { profile } from './profile.stub';

let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const render = () => act(async () => root.render(<ProfilePage who="ashwin@example.com" />));

describe('<ProfilePage>', () => {
  it('opens with identity and totals, each with context', async () => {
    await render();
    expect(container.querySelector('.pf-id h1')?.textContent).toBe('ashwin@example.com');
    expect(container.querySelector('.pf-avatar')?.textContent).toBe('A');
    const cells = Array.from(container.querySelectorAll('.pf-totals > div'), d => d.textContent);
    expect(cells).toEqual([
      'Active days3of 4 days',
      'Prompts207 per active day',
      'Tool calls754 per prompt',
      'Sub-agents—Not tracked yet',
      'Project labels20 active on 5+ days',
    ]);
  });

  it('falls back to a neutral identity without an account', async () => {
    await act(async () => root.render(<ProfilePage who="" />));
    expect(container.querySelector('.pf-id h1')?.textContent).toBe('Your profile');
    expect(container.querySelector('.pf-avatar svg')).not.toBeNull();
  });

  it('shows one cell per week and marks the current run', async () => {
    await render();
    expect(container.querySelectorAll('.pf-cell')).toHaveLength(26);
    const counted = profile.weeks.filter(([, d]) => d >= 3).length;
    expect(container.textContent).toContain(`${counted} of 26 weeks counted`);
    expect(container.querySelectorAll('.pf-cell[data-run="1"]')).toHaveLength(profile.streak.weeklyCurrent);
  });

  it('renders no emoji anywhere on the page', async () => {
    await render();
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('never calls an untracked achievement locked', async () => {
    await render();
    const untracked = Array.from(container.querySelectorAll('.pf-badge[data-status="untracked"]'));
    expect(untracked.length).toBeGreaterThan(0);
    for (const b of untracked) {
      expect(b.textContent).toContain('Not tracked yet');
      expect(b.textContent).not.toMatch(/locked/i);
    }
  });

  it('uses a distinct inline SVG emblem for every achievement, without external assets', async () => {
    await render();
    const emblems = Array.from(container.querySelectorAll<SVGElement>('.pf-badge-art'));
    expect(emblems.map(svg => svg.dataset.emblem)).toEqual(profile.achievements.map(a => a.id));
    expect(new Set(emblems.map(svg => svg.innerHTML)).size).toBe(profile.achievements.length);
    for (const svg of emblems) {
      expect(svg.getAttribute('viewBox')).toBe('0 0 48 48');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    }
    expect(container.querySelector('.pf-badges image, .pf-badges img, .pf-badges use')).toBeNull();
  });

  it('labels progress accessibly and never invents progress for untracked achievements', async () => {
    await render();
    const badges = Array.from(container.querySelectorAll('.pf-badge'));
    profile.achievements.forEach((a, i) => {
      const progress = badges[i]!.querySelector('[role="progressbar"]');
      if (a.status === 'untracked') {
        expect(progress).toBeNull();
        return;
      }
      expect(progress?.getAttribute('aria-label')).toBe(`${a.name} progress`);
      const value = Number(progress?.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      if (a.status === 'earned') expect(value).toBe(100);
    });
    expect(badges[0]!.textContent).toContain('3 / 14');
    expect(badges[0]!.textContent).toContain('11 to go');
  });

  it('leaves projects to the Projects page', async () => {
    await render();
    expect(container.querySelector('.pj-projects')).toBeNull();
    expect(Array.from(container.querySelectorAll('h2'), h => h.textContent)).not.toContain('Projects');
  });
});
