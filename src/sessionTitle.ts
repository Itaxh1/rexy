import { SOURCES, type Sess, type Story } from './data';

/** Recognize injected setup, not ordinary requests to edit AGENTS.md. */
export const isSetupText = (text: string) => /^(?:#{1,6}\s*)?(?:(?:AGENTS|CLAUDE)\.md\s+instructions\b|<(?:instructions|environment_context|system-reminder|permissions instructions|turn_aborted)\b|<!--\s*context7\b)/i.test(text.trim());
const meaningful = (text?: string | null) => {
  if (!text || isSetupText(text)) return null;
  const clean = text.replace(/^\s*#{1,6}\s*/, '').replace(/\s+/g, ' ').trim();
  return /^(?:untitled(?: session)?|unknown project|continue|proceed|yes|ok(?:ay)?|thanks)[.!\s]*$/i.test(clean) ? null : clean || null;
};
const shorten = (text: string) => text.length <= 96 ? text : text.slice(0, 95).replace(/\s+\S*$/, '') + '…';

/** Display-only; no model calls, source rewrites, or waiting for additional reads. */
export function sessionTitle(session: Sess, story: Story[] = []): string {
  // A TLDR describes an outcome, not the conversation's stable task name.
  const saved = meaningful(session.title);
  if (saved) return shorten(saved);
  const prompt = story.filter(row => row.s === session.id && row.k === 'user' && meaningful(row.x))
    .sort((a, b) => a.t - b.t)[0];
  if (prompt) return shorten(meaningful(prompt.x)!);
  return shorten(`${meaningful(session.proj) ?? SOURCES.find(source => source.id === session.src)!.label} session`);
}
