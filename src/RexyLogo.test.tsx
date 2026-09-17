// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import icon from '../public/rexy-icon.svg?raw';
import RexyLogo from './RexyLogo';

describe('Rexy brand', () => {
  it('keeps a readable name and a decorative, self-contained vector mark', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<RexyLogo />);
    const mark = container.querySelector('svg')!;
    expect(container.textContent).toBe('Rexy');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('focusable')).toBe('false');
    expect(mark.getAttribute('viewBox')).toBe('0 0 36 36');
    expect(mark.getAttribute('width')).toBe('28');
    expect(mark.querySelectorAll('path')).toHaveLength(3);
    expect(container.querySelector('image, img, use, animate')).toBeNull();
  });

  it('uses the same linework in the larger sign-in lockup', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<RexyLogo className="amark" size={42} />);
    expect(container.querySelector('.amark')).not.toBeNull();
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('42');
    expect(container.textContent).toBe('Rexy');
  });

  it('links the tab icon to a valid, self-contained SVG asset', () => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const link = document.querySelector('link[rel="icon"]')!;
    expect(link.getAttribute('href')).toBe('/rexy-icon.svg');
    expect(link.getAttribute('type')).toBe('image/svg+xml');
    const svg = new DOMParser().parseFromString(icon, 'image/svg+xml');
    expect(svg.querySelector('parsererror')).toBeNull();
    expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 36 36');
    expect(svg.querySelector('image, script, foreignObject')).toBeNull();
  });
});
