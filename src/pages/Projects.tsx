import { useCallback, useState, type ReactNode } from 'react';
import ProjectsPanel from './ProjectsPanel';
import { projects, projectsTotal } from './projects.stub';
import { useSaved } from '../useSaved';
import { request } from '../api';
import type { DocsResponse, ProjectsResponse } from '../insightTypes';

/** Explicit demo route: synthetic fixtures only. LiveProjects below uses the API. */
export default function ProjectsPage() {
  return <Layout><ProjectsPanel projects={projects} total={projectsTotal} /></Layout>;
}

export function LiveProjects({ account, token }: { account: string; token: string }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const list = useSaved<ProjectsResponse>(`/v1/projects?tz=${encodeURIComponent(tz)}`, account, token);
  const [selected, setSelected] = useState<string | null>(null);
  const select = useCallback((id: string) => setSelected(id), []);
  const detail = useSaved<DocsResponse>(selected ? `/v1/projects/${selected}/docs` : null, account, token);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, action: 'generate' | 'cancel') => {
    if (busy) return;
    setBusy(id); setActionError(null);
    try {
      await request(`/v1/projects/${id}/docs/${action}`, token, { method: 'POST' });
      detail.reload(); list.reload();
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const entries = (list.data?.projects ?? []).map(p => p.id === selected && detail.data
    ? { ...p, docs: detail.data.docs ?? undefined, hasDocs: !!detail.data.docs,
        state: detail.data.state, stale: detail.data.stale, error: detail.data.error } : p);
  return <Layout>
    <p className="pj-muted" role="status">
      {list.cached ? 'Saved projects · checking for updates…' : list.data?.updating ? 'Updating projects from imported history…' : 'Saved project context · generate only when you choose'}
    </p>
    {(actionError || list.error || detail.error) && <p role="alert">{actionError || list.error || detail.error}<button className="link" onClick={() => { list.reload(); detail.reload(); }}>Retry</button></p>}
    {entries.length ? <ProjectsPanel projects={entries} total={list.data!.total} onSelect={select}
      onGenerate={id => void act(id, 'generate')} onCancel={id => void act(id, 'cancel')}
      generationAvailable={!!list.data?.generationAvailable && !busy} />
      : <div className="empty">{!list.data || list.data.updating ? 'Preparing your projects…' : 'No named projects in imported history yet.'}</div>}
  </Layout>;
}

function Layout({ children }: { children: ReactNode }) {
  return <main className="pj"><div className="panel pj-app">
    <header className="pj-head"><h1>Projects</h1><p>Grok writes a PROJECT.md for you and a SKILL.md for Claude Code and Codex, on demand from recorded conversations. Review before use.</p></header>
    {children}
  </div></main>;
}
