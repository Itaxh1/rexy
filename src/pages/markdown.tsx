import type { ReactNode } from 'react';

/** Renders the Markdown subset used by generated project files: #, ## and ###
 *  headings, "- " lists, paragraphs, `code`, **strong** and _emphasis_.
 *  Output is React elements only, never an HTML string, so model-written text
 *  cannot inject markup. Links and images stay plain text on purpose.
 *  Headings map to h3–h5 because the file sits under the page's h1 and the
 *  project's h2. */

export function splitFrontmatter(file: string): { meta: [string, string][]; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(file);
  if (!match) return { meta: [], body: file };
  const meta = match[1]!.split('\n').flatMap((line): [string, string][] => {
    const i = line.indexOf(':');
    return i > 0 ? [[line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]] : [];
  });
  return { meta, body: file.slice(match[0].length).replace(/^\n+/, '') };
}

// One capture group, so split() alternates plain text (even) and a match (odd).
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<!\w)_[^_\n]+_(?!\w))/;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <em key={i}>{part.slice(1, -1)}</em>;
  });
}

const HEADINGS = ['h3', 'h4', 'h5'] as const;

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    para = []; list = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const Tag = HEADINGS[heading[1]!.length - 1]!;
      blocks.push(<Tag key={blocks.length}>{inline(heading[2]!)}</Tag>);
    } else if (item) {
      if (para.length) flush();
      list.push(item[1]!);
    } else if (!line) {
      flush();
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return <div className="pj-md">{blocks}</div>;
}
