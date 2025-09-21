import type {
  ExtractedContent,
  ExtractedElement,
  RegionInfo,
  SmartDOMResult,
  StructuralOverview,
} from './types';

export type MarkdownDetailLevel = 'summary' | 'region' | 'deep';

export interface MarkdownFormatOptions {
  detail?: MarkdownDetailLevel;
  maxTextLength?: number;
  maxElements?: number;
}

type PageMeta = { title?: string; url?: string };

function truncate(text: string | undefined, len?: number): string {
  const t = (text ?? '').trim();
  if (!len || t.length <= len) return t;
  return t.slice(0, len) + '...';
}

function bestSelector(el: Pick<ExtractedElement, 'selector' | 'tag' | 'text'>): string {
  return el.selector?.css || '';
}

function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  // Convert to unsigned and base36 for compactness
  return 'sec-' + (h >>> 0).toString(36);
}

function iconForRegion(key: string): string {
  switch (key) {
    case 'header':
      return '🧭';
    case 'navigation':
      return '📑';
    case 'main':
      return '📄';
    case 'sections':
      return '🗂️';
    case 'sidebar':
      return '📚';
    case 'footer':
      return '🔻';
    case 'modals':
      return '💬';
    default:
      return '🔹';
  }
}

function elementLine(el: ExtractedElement, opts?: MarkdownFormatOptions): string {
  const txt = truncate(el.text || el.attributes?.ariaLabel, opts?.maxTextLength ?? 80);
  const sel = bestSelector(el);
  const tag = el.tag.toLowerCase();
  const action = el.interaction?.submit
    ? 'submit'
    : el.interaction?.click
      ? 'click'
      : el.interaction?.change
        ? 'change'
        : undefined;
  const actionText = action ? ` (${action})` : '';
  return `- ${tag.toUpperCase()}: ${txt || '(no text)'} → \`${sel}\`${actionText}`;
}

function renderInteractive(
  inter: SmartDOMResult['interactive'],
  opts?: MarkdownFormatOptions
): string {
  const parts: string[] = [];

  const limit = (arr: ExtractedElement[]) =>
    typeof opts?.maxElements === 'number' ? arr.slice(0, opts.maxElements) : arr;

  if (inter.buttons.length) {
    parts.push('Buttons:');
    for (const el of limit(inter.buttons)) parts.push(elementLine(el, opts));
  }
  if (inter.links.length) {
    parts.push('Links:');
    for (const el of limit(inter.links)) parts.push(elementLine(el, opts));
  }
  if (inter.inputs.length) {
    parts.push('Inputs:');
    for (const el of limit(inter.inputs)) parts.push(elementLine(el, opts));
  }
  if (inter.clickable.length) {
    parts.push('Other Clickable:');
    for (const el of limit(inter.clickable)) parts.push(elementLine(el, opts));
  }
  if (inter.forms.length) {
    parts.push('Forms:');
    for (const f of limit(inter.forms as unknown as ExtractedElement[])) {
      // FormInfo is not ExtractedElement; render minimally
      // @ts-expect-error — using selector from FormInfo shape
      parts.push(`- FORM: action=${f.action ?? '-'} method=${f.method ?? '-'} → \`${f.selector}\``);
    }
  }

  return parts.join('\n');
}

function renderRegionInfo(region: RegionInfo): string {
  const icon = iconForRegion('region');
  const id = hashId(`${region.selector}|${region.label ?? ''}|${region.role ?? ''}`);
  const label = region.label ? ` ${region.label}` : '';
  const stats: string[] = [];
  if (region.buttonCount) stats.push(`${region.buttonCount} buttons`);
  if (region.linkCount) stats.push(`${region.linkCount} links`);
  if (region.inputCount) stats.push(`${region.inputCount} inputs`);
  if (region.textPreview) stats.push(`“${truncate(region.textPreview, 80)}”`);
  const statsLine = stats.length ? ` — ${stats.join(', ')}` : '';
  return `${icon} ${label} → \`${region.selector}\` [${id}]${statsLine}`;
}

function wrapXml(body: string, meta?: PageMeta, type: string = 'section'): string {
  const attrs = [
    meta?.title ? `title="${escapeXml(meta!.title!)}"` : null,
    meta?.url ? `url="${escapeXml(meta!.url!)}"` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return `<page ${attrs}>\n  <${type}><![CDATA[\n${body}\n]]></${type}>\n</page>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class MarkdownFormatter {
  static structure(
    overview: StructuralOverview,
    _opts: MarkdownFormatOptions = {},
    meta?: PageMeta
  ): string {
    const lines: string[] = [];
    lines.push(`# Page Outline`);
    if (meta?.title || meta?.url) {
      lines.push(`Title: ${meta?.title ?? ''}`.trim());
      lines.push(`URL: ${meta?.url ?? ''}`.trim());
    }
    lines.push('');

    const regions = overview.regions;
    const entries: Array<[string, RegionInfo | RegionInfo[] | undefined]> = [
      ['header', regions.header],
      ['navigation', regions.navigation],
      ['main', regions.main],
      ['sections', regions.sections],
      ['sidebar', regions.sidebar],
      ['footer', regions.footer],
      ['modals', regions.modals],
    ];

    for (const [key, value] of entries) {
      if (!value) continue;
      const icon = iconForRegion(key);
      if (Array.isArray(value)) {
        if (!value.length) continue;
        lines.push(`## ${icon} ${capitalize(key)}`);
        for (const region of value) lines.push(renderRegionInfo(region));
      } else {
        lines.push(`## ${icon} ${capitalize(key)}`);
        lines.push(renderRegionInfo(value));
      }
      lines.push('');
    }

    // Suggestions
    if (overview.suggestions?.length) {
      lines.push('## Suggestions');
      for (const s of overview.suggestions) lines.push(`- ${s}`);
      lines.push('');
    }

    lines.push(
      'Next: choose a region (by selector or [sectionId]) and call dom_extract_region for actionable details.'
    );

    const body = lines.join('\n');
    return wrapXml(body, meta, 'outline');
  }

  static region(result: SmartDOMResult, opts: MarkdownFormatOptions = {}, meta?: PageMeta): string {
    const lines: string[] = [];
    lines.push(`# Region Details`);
    if (meta?.title || meta?.url) {
      lines.push(`Title: ${meta?.title ?? ''}`.trim());
      lines.push(`URL: ${meta?.url ?? ''}`.trim());
    }
    lines.push('');

    const inter = result.interactive;
    const summary: string[] = [];
    const count = (arr: unknown[]) => (arr ? arr.length : 0);
    summary.push(`${count(inter.buttons)} buttons`);
    summary.push(`${count(inter.links)} links`);
    summary.push(`${count(inter.inputs)} inputs`);
    if (inter.forms?.length) summary.push(`${count(inter.forms)} forms`);
    lines.push(`Summary: ${summary.join(', ')}`);
    lines.push('');

    lines.push(renderInteractive(inter, opts));
    lines.push('');
    lines.push(
      'Next: write a script using the most stable selectors above. If selectors look unstable, rerun dom_extract_region with higher detail or call dom_extract_content for text context.'
    );

    const body = lines.join('\n');
    return wrapXml(body, meta, 'section');
  }

  static content(
    content: ExtractedContent,
    opts: MarkdownFormatOptions = {},
    meta?: PageMeta
  ): string {
    const lines: string[] = [];
    lines.push(`# Content`);
    lines.push(`Selector: \`${content.selector}\``);
    lines.push('');

    if (content.text.headings?.length) {
      lines.push('Headings:');
      for (const h of content.text.headings)
        lines.push(`- H${h.level}: ${truncate(h.text, opts.maxTextLength ?? 120)}`);
      lines.push('');
    }
    if (content.text.paragraphs?.length) {
      const limit =
        typeof opts.maxElements === 'number' ? opts.maxElements : content.text.paragraphs.length;
      lines.push('Paragraphs:');
      for (const p of content.text.paragraphs.slice(0, limit))
        lines.push(`- ${truncate(p, opts.maxTextLength ?? 200)}`);
      lines.push('');
    }
    if (content.text.lists?.length) {
      lines.push('Lists:');
      for (const list of content.text.lists) {
        lines.push(`- ${list.type.toUpperCase()}:`);
        const limit = typeof opts.maxElements === 'number' ? opts.maxElements : list.items.length;
        for (const item of list.items.slice(0, limit))
          lines.push(`  - ${truncate(item, opts.maxTextLength ?? 120)}`);
      }
      lines.push('');
    }

    if (content.tables?.length) {
      lines.push('Tables:');
      for (const t of content.tables) {
        lines.push(`- Headers: ${t.headers.join(' | ')}`);
        const limit = typeof opts.maxElements === 'number' ? opts.maxElements : t.rows.length;
        for (const row of t.rows.slice(0, limit)) lines.push(`  - ${row.join(' | ')}`);
      }
      lines.push('');
    }

    if (content.media?.length) {
      lines.push('Media:');
      const limit = typeof opts.maxElements === 'number' ? opts.maxElements : content.media.length;
      for (const m of content.media.slice(0, limit)) {
        lines.push(`- ${m.type.toUpperCase()}: ${m.alt ?? ''} ${m.src ? `→ ${m.src}` : ''}`.trim());
      }
      lines.push('');
    }

    lines.push(
      'Next: if text is insufficient for targeting, call dom_extract_region for interactive selectors.'
    );

    const body = lines.join('\n');
    return wrapXml(body, meta, 'content');
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
