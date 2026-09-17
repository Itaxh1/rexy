import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Markdown, splitFrontmatter } from './markdown';
import { SKILL_LIMIT, type OpenQuestion, type Project } from './projects.stub';

/** Projects: pick a project, read the two files Grok wrote for it.
 *  PROJECT.md is for the person; SKILL.md is for Claude Code and Codex once saved.
 *  Layout: the list header, reader header and file tabs stay put; only the project
 *  list (.pj-ptabs) and the file (.pj-rbody) scroll.
 *  Live actions are supplied by LiveProjects; demo interactions remain local. */

type FileId = 'project' | 'skill';
const FILES: { id: FileId; name: string }[] = [
  { id: 'project', name: 'PROJECT.md' },
  { id: 'skill', name: 'SKILL.md' },
];
type StatusKey = 'none' | 'queued' | 'question' | 'stale' | 'ready';

const n = (v: number) => v.toLocaleString();
const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? '' : 's'}`;
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const skillBody = (file: string) => splitFrontmatter(file).body.trim();
/** The SKILL.md limit counts Unicode code points, as the backend validator will, not UTF-16 units. */
export const codePoints = (text: string) => [...text].length;

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const fmtDate = (iso: string) => day(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const fmtRange = (a: string, b: string) => {
  const sameYear = day(a).getFullYear() === day(b).getFullYear();
  return `${day(a).toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmtDate(b)}`;
};

/** Arrow-key movement for a tab list; null when the key isn't a navigation key. */
function moveIndex(key: string, i: number, count: number, prev: string, next: string) {
  if (key === next) return (i + 1) % count;
  if (key === prev) return (i - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export default function ProjectsPanel({ projects, total, onSelect, onGenerate, onCancel, generationAvailable = true }: {
  projects: Project[]; total: number; onSelect?: (id: string) => void;
  onGenerate?: (id: string) => void; onCancel?: (id: string) => void; generationAvailable?: boolean;
}) {
  const [selected, setSelected] = useState(() => (projects.find(p => p.docs?.questions.length) ?? projects[0])?.name);
  const [file, setFile] = useState<FileId>('project');
  const [source, setSource] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [queued, setQueued] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const projectTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const fileTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const body = useRef<HTMLDivElement>(null);

  // The reader keeps one scroll container across projects; start every file at its top.
  useEffect(() => { if (body.current) body.current.scrollTop = 0; }, [selected, file]);
  useEffect(() => {
    const p = projects.find(p => p.name === selected) ?? projects[0];
    if (p && p.name !== selected) setSelected(p.name);
    if (p?.id) onSelect?.(p.id);
  }, [selected, projects, onSelect]);

  const openQuestions = (p: Project) => p.docs?.questions.filter(q => answers[`${p.name}/${q.id}`] === undefined) ?? [];
  const status = (p: Project): { key: StatusKey; label: string } => {
    if (p.state === 'queued' || p.state === 'running' || queued[p.name]) return { key: 'queued', label: p.state === 'running' ? 'Generating' : 'Queued' };
    if (p.state === 'failed') return { key: 'none', label: 'Retry available' };
    if (p.hasDocs && !p.docs) return { key: p.stale ? 'stale' : 'ready', label: p.stale ? 'Update available' : 'Saved' };
    if (!p.docs) return { key: 'none', label: 'Not generated' };
    const open = openQuestions(p).length;
    if (open) return { key: 'question', label: plural(open, 'question') };
    // Live freshness uses the evidence revision, not the bounded sample size.
    const behind = p.stale === undefined ? p.sessions - p.docs.sessionsCovered : 0;
    if (p.stale || behind > 0) return { key: 'stale', label: behind > 0 ? plural(behind, 'new session') : 'Update available' };
    return { key: 'ready', label: 'Ready' };
  };

  const setQueue = (name: string, on: boolean) => setQueued(q => ({ ...q, [name]: on }));
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1400);
    } catch { setCopied(null); }
  };
  const download = (name: string, text: string) => {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { /* downloads are unavailable in some embedded browsers */ }
  };

  const onProjectKey = (e: KeyboardEvent, i: number) => {
    const j = moveIndex(e.key, i, projects.length, 'ArrowUp', 'ArrowDown');
    if (j === null) return;
    e.preventDefault();
    setSelected(projects[j]!.name);
    projectTabs.current[j]?.focus();
  };
  const onFileKey = (e: KeyboardEvent, i: number) => {
    const j = moveIndex(e.key, i, FILES.length, 'ArrowLeft', 'ArrowRight');
    if (j === null) return;
    e.preventDefault();
    setFile(FILES[j]!.id);
    fileTabs.current[j]?.focus();
  };

  const p = projects.find(x => x.name === selected);
  const docs = p?.docs;
  const isQueued = p ? p.state === 'queued' || p.state === 'running' || !!queued[p.name] : false;
  const generate = () => { if (p?.id && onGenerate) onGenerate(p.id); else if (p) setQueue(p.name, true); };
  const cancel = () => { if (p?.id && onCancel) onCancel(p.id); else if (p) setQueue(p.name, false); };
  const text = docs ? (file === 'project' ? docs.projectMd : docs.skillMd) : '';
  const fileName = FILES.find(f => f.id === file)!.name;
  const bodyLength = docs ? codePoints(skillBody(docs.skillMd)) : 0;
  const installName = docs ? splitFrontmatter(docs.skillMd).meta.find(([key]) => key === 'name')?.[1] : null;

  return (
    <div className="pj-projects">
      <div className="pj-plist">
        <div className="pj-plist-h">
          <span className="pj-label">{projects.length} of {total} projects</span>
          <span className="pj-muted">{onSelect ? 'recorded folder labels' : 'active on 5+ days'}</span>
        </div>
        <div role="tablist" aria-orientation="vertical" aria-label="Projects" className="pj-ptabs pj-scroll">
          {projects.map((x, i) => {
            const s = status(x);
            const on = x.name === selected;
            return (
              <button key={x.name} ref={el => { projectTabs.current[i] = el; }} type="button" role="tab"
                id={`pj-tab-${slug(x.name)}`} aria-selected={on} aria-controls="pj-reader" tabIndex={on ? 0 : -1}
                className="pj-pitem" onClick={() => setSelected(x.name)} onKeyDown={e => onProjectKey(e, i)}>
                <span className="pj-pname">{x.name}</span>
                <span className="pj-pstate" data-state={s.key}>
                  <i className="pj-dot" data-state={s.key} aria-hidden="true" />
                  {s.label}
                  <span className="pj-pdays">{x.days} days</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {p && (
        <section className="pj-reader" role="tabpanel" id="pj-reader" aria-label={p.name}>
          <header className="pj-rhead">
            <div>
              <h2>{p.name}</h2>
              <p className="pj-rmeta">
                {p.agents} · {plural(p.sessions, 'session')} · {p.days} active days · {n(p.prompts)} prompts · {fmtRange(p.firstActive, p.lastActive)}
              </p>
              {docs && (
                <p className="pj-gen">
                  Written by Grok ({docs.model}) on {fmtDate(docs.generatedAt)} from{' '}
                  {docs.evidenceCount !== undefined ? `${docs.evidenceCount} selected prompts across ` : ''}
                  {docs.sessionsCovered >= p.sessions ? `all ${plural(p.sessions, 'session')}` : `${docs.sessionsCovered} of ${plural(p.sessions, 'session')}`}.
                </p>
              )}
            </div>
            {docs && !isQueued && (
              <button type="button" className="pill ghost" disabled={!generationAvailable} onClick={generate}>Regenerate</button>
            )}
          </header>

          {docs && (
            <div className="pj-filebar">
              <div role="tablist" aria-label="Files" className="pj-files">
                {FILES.map((f, i) => (
                  <button key={f.id} ref={el => { fileTabs.current[i] = el; }} type="button" role="tab"
                    id={`pj-file-${f.id}`} aria-selected={file === f.id} aria-controls="pj-file" tabIndex={file === f.id ? 0 : -1}
                    className="pj-filetab" onClick={() => setFile(f.id)} onKeyDown={e => onFileKey(e, i)}>
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="pj-tools">
                <div className="pj-toggle" role="group" aria-label="View">
                  <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>Preview</button>
                  <button type="button" aria-pressed={source} onClick={() => setSource(true)}>Source</button>
                </div>
                <button type="button" className="btn" onClick={() => copy(`${p.name}/${file}`, text)}>
                  {copied === `${p.name}/${file}` ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="btn" onClick={() => download(fileName, text)}>Download</button>
              </div>
            </div>
          )}

          <div className="pj-rbody pj-scroll" ref={body}>
            {p.error && <p role="alert">{p.error}</p>}
            {isQueued && (
              <p className="pj-queued" role="status">
                <i className="pj-dot" data-state="queued" aria-hidden="true" />
                Queued. Grok is writing {docs ? 'new versions of both files' : 'PROJECT.md and SKILL.md'} from {plural(p.sessions, 'session')}.
                {docs ? ' The current files stay until then.' : ''}{' '}
                <button type="button" className="link" onClick={cancel}>Cancel</button>
              </p>
            )}

            {!docs ? (
              <div className="pj-empty">
                <h3>{p.hasDocs ? 'Loading saved files…' : 'No files yet'}</h3>
                <p>
                  Grok reads a bounded selection of redacted prompts from {plural(p.sessions, 'session')},
                  then writes two files. Tool output is never sent.
                </p>
                <dl className="pj-filedefs">
                  <div><dt>PROJECT.md</dt><dd>What the project is, where things are, how to check work, and your decisions. For you, or to paste into a new chat.</dd></div>
                  <div><dt>SKILL.md</dt><dd>The same context in {SKILL_LIMIT} characters or less, for Claude Code and Codex once you save it to their skills folder.</dd></div>
                </dl>
                {!isQueued && !p.hasDocs && <button type="button" className="pill" disabled={!generationAvailable} onClick={generate}>Generate with Grok</button>}
                {!generationAvailable && <p>Generation is not configured. Saved files remain readable.</p>}
              </div>
            ) : (
              <>
                {docs.questions.map(q => (
                  <Question key={q.id} q={q} chosen={answers[`${p.name}/${q.id}`]}
                    onChoose={i => setAnswers(a => {
                      const next = { ...a };
                      if (i === undefined) delete next[`${p.name}/${q.id}`]; else next[`${p.name}/${q.id}`] = i;
                      return next;
                    })} />
                ))}

                <div role="tabpanel" id="pj-file" aria-labelledby={`pj-file-${file}`} className="pj-file">
                  {file === 'project' ? (
                    <p className="pj-purpose">For you, or paste it into a new chat.</p>
                  ) : (
                    <p className="pj-purpose">
                      Claude Code and Codex use this after you save it to their skills folder.
                      <span className="pj-count" data-over={bodyLength > SKILL_LIMIT ? 1 : 0}>{bodyLength} / {SKILL_LIMIT} characters</span>
                    </p>
                  )}
                  {source ? <pre className="pj-source">{text}</pre>
                    : file === 'project' ? <Markdown text={text} /> : <SkillPreview file={text} />}
                  {file === 'skill' && (
                    <p className="pj-install">
                      Save as <code>~/.claude/skills/{installName || `rexy-${slug(p.name)}`}/SKILL.md</code> or <code>~/.codex/skills/{installName || `rexy-${slug(p.name)}`}/SKILL.md</code>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Question({ q, chosen, onChoose }: { q: OpenQuestion; chosen: number | undefined; onChoose: (i: number | undefined) => void }) {
  return (
    <div className="pj-question" role="group" aria-label={q.subject}>
      <div className="pj-question-head">
        <i className="pj-dot" data-state={chosen === undefined ? 'question' : 'ready'} aria-hidden="true" />
        <b>{q.subject}</b>
        <span className="pj-muted">You said both. Pick the one that still applies.</span>
      </div>
      <div className="pj-options">
        {q.options.map((o, i) => (
          <button key={o.date} type="button" className="pj-option" aria-pressed={chosen === i} onClick={() => onChoose(i)}>
            <span className="pj-option-date">{o.date}</span>
            <span className="pj-option-quote">“{o.quote}”</span>
          </button>
        ))}
      </div>
      {chosen !== undefined && (
        <p className="pj-note" role="status">
          Saved: {q.options[chosen]!.date} applies. Regenerate to add it to both files.{' '}
          <button type="button" className="link" onClick={() => onChoose(undefined)}>Undo</button>
        </p>
      )}
    </div>
  );
}

function SkillPreview({ file }: { file: string }) {
  const { meta, body } = splitFrontmatter(file);
  return (
    <>
      <dl className="pj-front">
        {meta.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
      </dl>
      <Markdown text={body} />
    </>
  );
}
