import { describe, expect, it } from 'vitest';

import { MarkdownFormatter } from './markdown-formatter';
import type { ExtractedElement, SmartDOMResult } from './types';

function button(id: string): ExtractedElement {
  return {
    tag: 'BUTTON',
    text: id,
    selector: { css: `#${id}`, xpath: `//*[@id="${id}"]` },
    attributes: {},
    context: { parentChain: [] },
    interaction: { click: true },
  };
}

const result: SmartDOMResult = {
  mode: 'interactive',
  timestamp: 0,
  page: {
    url: 'https://example.com/',
    title: 'Example',
    hasErrors: false,
    isLoading: false,
    hasModals: false,
  },
  landmarks: {
    navigation: [],
    main: [],
    forms: [],
    headers: [],
    footers: [],
    articles: [],
    sections: [],
  },
  interactive: {
    buttons: [button('save'), button('cancel')],
    links: [],
    inputs: [],
    forms: [],
    clickable: [],
  },
};

describe('MarkdownFormatter.region', () => {
  it('treats a null maxElements from JSON callers as no limit', () => {
    const markdown = MarkdownFormatter.region(result, JSON.parse('{"maxElements":null}'));

    expect(markdown).toContain('`#save`');
    expect(markdown).toContain('`#cancel`');
  });

  it('limits interactive elements to maxElements', () => {
    const markdown = MarkdownFormatter.region(result, { maxElements: 1 });

    expect(markdown).toContain('`#save`');
    expect(markdown).not.toContain('`#cancel`');
  });
});
