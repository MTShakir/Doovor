/**
 * The few pieces of Markdown a guide is written in (D-255), read into blocks the site draws in its
 * own components: headings, paragraphs, lists, tables, a note and a picture of the app (D-387), and
 * inside a line, bold and links. Nothing else is understood, and anything else is refused by name,
 * so a guide can never carry HTML or a script into a page, and a slip in the writing fails a test
 * rather than showing on the site.
 */

import { isGuideImageKey, type GuideImageKey } from './images.ts';

export type Inline = { kind: 'text'; text: string } | { kind: 'strong'; text: string } | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'heading'; level: 2 | 3; text: string; id: string }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'note'; content: Inline[] }
  | { kind: 'image'; key: GuideImageKey; alt: string; caption: string };

/** A picture on a line of its own: `![what it shows](name "what to notice")`. */
const imageLine = /^!\[([^\]]+)\]\(([a-z0-9-]+) "([^"]+)"\)$/;

/** A picture's words are plain: no HTML, no Markdown, and something to read either side of it. */
function plainWords(text: string, what: string, line: string): string {
  const words = text.trim();
  if (words === '' || /[<*[\]]/.test(words)) throw new Error(`A picture's ${what} is plain words: ${line}`);
  return words;
}

function imageBlock(line: string): Block {
  const match = imageLine.exec(line);
  if (match === null) throw new Error(`A picture in a guide is ![what it shows](name "what to notice"), on a line of its own: ${line}`);
  const [, alt = '', key = '', caption = ''] = match;
  if (!isGuideImageKey(key)) throw new Error(`A guide shows only the pictures in images.ts, not ${key}`);
  return { kind: 'image', key, alt: plainWords(alt, 'description', line), caption: plainWords(caption, 'caption', line) };
}

const inlinePattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** A link goes to one of our own pages, or to a site over https. */
function checkedHref(href: string): string {
  if ((href.startsWith('/') && !href.startsWith('//')) || href.startsWith('https://')) return href;
  throw new Error(`A link in a guide goes to one of our own pages or a secure site, not ${href}`);
}

export function parseInline(line: string): Inline[] {
  if (line.includes('<')) throw new Error(`A guide cannot carry HTML: ${line}`);
  if (line.includes('![')) throw new Error(`A picture in a guide sits on a line of its own: ${line}`);
  const content: Inline[] = [];
  let at = 0;
  for (const match of line.matchAll(inlinePattern)) {
    const before = line.slice(at, match.index);
    if (before !== '') content.push({ kind: 'text', text: before });
    const [, strong, linkText, href] = match;
    if (strong !== undefined) content.push({ kind: 'strong', text: strong });
    else if (linkText !== undefined && href !== undefined) content.push({ kind: 'link', text: linkText, href: checkedHref(href) });
    at = match.index + match[0].length;
  }
  const rest = line.slice(at);
  if (rest !== '') content.push({ kind: 'text', text: rest });
  for (const piece of content) {
    if (piece.kind === 'text' && piece.text.includes('**')) throw new Error(`A guide has bold that never closes: ${line}`);
  }
  return content;
}

/** The address of a heading within its page: its words, lower case, joined by hyphens. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The lines of a source written indented inside a template, with the indent and blank ends gone. */
function lines(source: string): string[] {
  const all = source.replace(/\r\n/g, '\n').split('\n');
  while (all.length > 0 && (all[0] ?? '').trim() === '') all.shift();
  while (all.length > 0 && (all[all.length - 1] ?? '').trim() === '') all.pop();
  const indents = all.filter((line) => line.trim() !== '').map((line) => line.length - line.trimStart().length);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return all.map((line) => line.slice(indent).trimEnd());
}

function cells(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const separatorRow = /^\|(\s*:?-{3,}:?\s*\|)+$/;

export function parseGuideMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const ids = new Map<string, number>();
  const all = lines(source);
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  // Lines that start the same way and follow each other, from `from`: a list, a note, a table.
  const run = (from: number, starts: RegExp): string[] => {
    const taken: string[] = [];
    for (let at = from; at < all.length && starts.test(all[at] ?? ''); at += 1) taken.push(all[at] ?? '');
    return taken;
  };

  for (let at = 0; at < all.length; ) {
    const line = all[at] ?? '';
    if (line.trim() === '') {
      endParagraph();
      at += 1;
      continue;
    }
    const heading = /^(#+)\s+(.*)$/.exec(line);
    if (heading) {
      endParagraph();
      const level = (heading[1] ?? '').length;
      if (level !== 2 && level !== 3) throw new Error(`A guide uses ## and ### for a heading, not ${heading[1] ?? ''}: the title is its own`);
      const text = (heading[2] ?? '').trim();
      const base = headingId(text);
      const seen = ids.get(base) ?? 0;
      ids.set(base, seen + 1);
      blocks.push({ kind: 'heading', level, text, id: seen === 0 ? base : `${base}-${String(seen + 1)}` });
      at += 1;
      continue;
    }
    if (line.startsWith('![')) {
      endParagraph();
      blocks.push(imageBlock(line));
      at += 1;
      continue;
    }
    if (line.startsWith('- ') || /^\d+\. /.test(line)) {
      endParagraph();
      const ordered = /^\d+\. /.test(line);
      const items = run(at, ordered ? /^\d+\. / : /^- /);
      blocks.push({ kind: 'list', ordered, items: items.map((item) => parseInline(item.replace(/^(- |\d+\. )/, ''))) });
      at += items.length;
      continue;
    }
    if (line.startsWith('>')) {
      endParagraph();
      const note = run(at, /^>/);
      blocks.push({ kind: 'note', content: parseInline(note.map((one) => one.replace(/^>\s?/, '')).join(' ')) });
      at += note.length;
      continue;
    }
    if (line.startsWith('|')) {
      endParagraph();
      const table = run(at, /^\|/);
      const [head = '', separator = '', ...rows] = table;
      if (!separatorRow.test(separator)) throw new Error(`A guide's table needs a |---| row under its header: ${head}`);
      const header = cells(head);
      for (const row of rows) {
        if (cells(row).length !== header.length) throw new Error(`A guide's table has a row that is not as wide as its header: ${row}`);
      }
      blocks.push({ kind: 'table', header: header.map(parseInline), rows: rows.map((row) => cells(row).map(parseInline)) });
      at += table.length;
      continue;
    }
    paragraph.push(line.trim());
    at += 1;
  }
  endParagraph();
  return blocks;
}

function inlineWords(content: readonly Inline[]): string {
  return content.map((piece) => piece.text).join('');
}

/** How many words somebody reads in a guide's body, for how long it takes. */
export function wordCount(blocks: readonly Block[]): number {
  const text = blocks
    .map((block) => {
      switch (block.kind) {
        case 'heading':
          return block.text;
        case 'paragraph':
        case 'note':
          return inlineWords(block.content);
        case 'list':
          return block.items.map(inlineWords).join(' ');
        case 'table':
          return [...block.header, ...block.rows.flat()].map(inlineWords).join(' ');
        case 'image':
          // The caption is read; what the picture shows is for somebody who cannot see it.
          return block.caption;
      }
    })
    .join(' ');
  return text.split(/\s+/).filter((word) => word !== '').length;
}
