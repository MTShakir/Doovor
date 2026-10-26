import { describe, expect, it } from 'vitest';
import { headingId, parseGuideMarkdown, parseInline, wordCount } from './markdown.ts';

describe('the words inside a line (D-255)', () => {
  it('reads plain words, bold and links, in order', () => {
    expect(parseInline('Read **this** and [that page](/pricing) today.')).toEqual([
      { kind: 'text', text: 'Read ' },
      { kind: 'strong', text: 'this' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'that page', href: '/pricing' },
      { kind: 'text', text: ' today.' },
    ]);
  });

  it('takes links to our own pages and to secure sites, and nothing else', () => {
    expect(parseInline('[GOV.UK](https://www.gov.uk/x)')).toEqual([{ kind: 'link', text: 'GOV.UK', href: 'https://www.gov.uk/x' }]);
    expect(() => parseInline('[bad](javascript:alert(1))')).toThrow('link');
    expect(() => parseInline('[plain](http://example.com)')).toThrow('link');
  });

  it('refuses HTML and bold that never closes, rather than drawing them as words', () => {
    expect(() => parseInline('a <b>tag</b>')).toThrow('HTML');
    expect(() => parseInline('half **bold')).toThrow('bold');
  });
});

describe('a guide read into blocks (D-255)', () => {
  it('reads headings, paragraphs, lists, a table and a note', () => {
    const blocks = parseGuideMarkdown(`
      ## What changes

      Two lines of one
      paragraph.

      - First
      - Second with [a link](/learners)

      1. One
      2. Two

      | From | What |
      |---|---|
      | 6 April 2026 | **Over £50,000** |

      > A note to remember.

      ### A smaller heading
    `);
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: 'What changes', id: 'what-changes' },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Two lines of one paragraph.' }] },
      {
        kind: 'list',
        ordered: false,
        items: [
          [{ kind: 'text', text: 'First' }],
          [
            { kind: 'text', text: 'Second with ' },
            { kind: 'link', text: 'a link', href: '/learners' },
          ],
        ],
      },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'One' }], [{ kind: 'text', text: 'Two' }]] },
      {
        kind: 'table',
        header: [[{ kind: 'text', text: 'From' }], [{ kind: 'text', text: 'What' }]],
        rows: [[[{ kind: 'text', text: '6 April 2026' }], [{ kind: 'strong', text: 'Over £50,000' }]]],
      },
      { kind: 'note', content: [{ kind: 'text', text: 'A note to remember.' }] },
      { kind: 'heading', level: 3, text: 'A smaller heading', id: 'a-smaller-heading' },
    ]);
  });

  it('gives two headings with the same words their own addresses', () => {
    const blocks = parseGuideMarkdown('## Costs\n\n## Costs');
    expect(blocks.map((block) => (block.kind === 'heading' ? block.id : ''))).toEqual(['costs', 'costs-2']);
  });

  it('refuses a page title, a deeper heading and a table row of the wrong width', () => {
    expect(() => parseGuideMarkdown('# Title')).toThrow('heading');
    expect(() => parseGuideMarkdown('#### Deep')).toThrow('heading');
    expect(() => parseGuideMarkdown('| a | b |\n|---|---|\n| one |')).toThrow('table');
    expect(() => parseGuideMarkdown('| a | b |\n| one | two |')).toThrow('table');
  });
});

describe('a picture of the app in a guide (D-387)', () => {
  it('reads a picture on a line of its own: what it shows, which one, and its caption', () => {
    const blocks = parseGuideMarkdown(`
      Before it.

      ![A learner booking a lesson](booking-page "Booking from a link.")

      After it.
    `);
    expect(blocks).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Before it.' }] },
      { kind: 'image', key: 'booking-page', alt: 'A learner booking a lesson', caption: 'Booking from a link.' },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'After it.' }] },
    ]);
  });

  it('refuses a picture that does not exist, has no caption, carries markup, or sits inside a line', () => {
    expect(() => parseGuideMarkdown('![A screen](nowhere "Its caption.")')).toThrow('images.ts');
    expect(() => parseGuideMarkdown('![A screen](booking-page)')).toThrow('on a line of its own');
    expect(() => parseGuideMarkdown('![A **bold** screen](booking-page "Its caption.")')).toThrow('plain words');
    expect(() => parseGuideMarkdown('![A screen](booking-page "  ")')).toThrow('plain words');
    expect(() => parseGuideMarkdown('Look: ![A screen](booking-page "Its caption.")')).toThrow('line of its own');
    expect(() => parseInline('- ![A screen](booking-page "Its caption.")')).toThrow('line of its own');
  });

  it('counts a caption as read, and what a picture shows as not', () => {
    expect(wordCount(parseGuideMarkdown('![Five words nobody reads here](booking-page "Two words.")'))).toBe(2);
  });
});

describe('what a heading and a guide add up to', () => {
  it('makes an address from the words of a heading', () => {
    expect(headingId('When it applies to you')).toBe('when-it-applies-to-you');
    expect(headingId('Over £50,000: from 6 April 2026')).toBe('over-50-000-from-6-april-2026');
  });

  it('counts the words a reader reads', () => {
    expect(wordCount(parseGuideMarkdown('## Two words\n\nThree more [words here](/x).'))).toBe(6);
  });
});
