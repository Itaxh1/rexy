// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { LiveProfile } from './Profile';
import { LiveProjects } from './Projects';
import { profile, projects } from '../demo.safe';
import { request } from '../api';
import { readSaved, writeSaved } from '../savedCache';
vi.mock('../api', () => ({request:vi.fn()}));
vi.mock('../savedCache', () => ({readSaved:vi.fn(),writeSaved:vi.fn(),clearSaved:vi.fn(),onCacheClear:()=>()=>{}}));
let root:Root, container:HTMLDivElement;
const response={profile,purge:'0',updating:false,generatedAt:'2026-09-17',revision:'one',error:null};
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
  vi.mocked(readSaved).mockResolvedValue({data:null,epoch:0});
  vi.mocked(writeSaved).mockResolvedValue(true);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.clearAllMocks();});

describe('live account pages',()=>{
  it('renders API profile values instead of demo counts',async()=>{
    vi.mocked(request).mockResolvedValue({...response,profile:{...profile,toolCalls:123456}});
    await act(async()=>root.render(<LiveProfile who="Live" account="owner" token="token"/>));
    expect(container.querySelector('.pf-totals')?.textContent).toContain('123,456');
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/v1/profile?tz='),'token',expect.any(Object));
  });
  it('paints saved profile while the backend is unavailable',async()=>{
    vi.mocked(readSaved).mockResolvedValue({data:response,epoch:4});
    vi.mocked(request).mockRejectedValue(Error('Backend unavailable'));
    await act(async()=>root.render(<LiveProfile who="Cached" account="owner" token="token"/>));
    expect(container.querySelector('.pf-totals')).not.toBeNull();
    expect(container.textContent).toContain('Saved data stays visible');
  });
  it('never carries profile data into a different account',async()=>{
    vi.mocked(request).mockResolvedValue({...response,profile:{...profile,toolCalls:123456}});
    await act(async()=>root.render(<LiveProfile who="First" account="first" token="one"/>));
    vi.mocked(request).mockImplementation(()=>new Promise(()=>{}));
    await act(async()=>root.render(<LiveProfile who="Second" account="second" token="two"/>));
    expect(container.textContent).not.toContain('123,456');
    expect(container.querySelector('.pf-totals')).toBeNull();
  });
  it('shows empty accounts without fake numbers or invalid ratios',async()=>{
    vi.mocked(request).mockResolvedValue({...response,profile:{...profile,since:null,activeDays:0,prompts:0,toolCalls:0,projectsTotal:0,projectsActive:0}});
    await act(async()=>root.render(<LiveProfile who="Empty" account="empty" token="token"/>));
    expect(container.textContent).toContain('No imported activity yet');
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
  it('loads real project files and never generates them on page load',async()=>{
    const p={...projects[0],id:'project-id',hasDocs:true};
    vi.mocked(request).mockImplementation(async(path)=>path.includes('/docs')
      ? {docs:p.docs,state:'ready',purge:'0',error:null,stale:false}
      : {projects:[p],total:1,purge:'0',updating:false,generationAvailable:true});
    await act(async()=>root.render(<LiveProjects account="owner" token="token"/>));
    expect(container.querySelector('.pj-filebar')).not.toBeNull();
    expect(container.querySelector('.pj-pname')?.textContent).toBe(p.name);
    expect(vi.mocked(request).mock.calls.every(([path])=>!path.endsWith('/generate'))).toBe(true);
  });
  it('wires Generate to the account-authenticated backend',async()=>{
    const p={...projects[1],id:'project-id',state:'none'};
    vi.mocked(request).mockImplementation(async(path)=>path.endsWith('/generate') ? {state:'queued'}
      : path.includes('/docs') ? {docs:null,state:'none',purge:'0',error:null,stale:false}
      : {projects:[p],total:1,purge:'0',updating:false,generationAvailable:true});
    await act(async()=>root.render(<LiveProjects account="owner" token="token"/>));
    const button=Array.from(container.querySelectorAll('button')).find(b=>b.textContent==='Generate with Grok')!;
    await act(async()=>button.click());
    expect(request).toHaveBeenCalledWith('/v1/projects/project-id/docs/generate','token',{method:'POST'});
  });
});
