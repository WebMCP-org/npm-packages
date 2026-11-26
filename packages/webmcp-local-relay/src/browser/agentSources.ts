export interface AgentSourceEntry {
  type: 'instruction' | 'skill';
  name: string;
  description?: string;
  content: string;
}

const MAX_ENTRIES = 16;
const MAX_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 512;
const MAX_CONTENT_LENGTH = 8_192;

/** Normalize both browser declarations and untrusted wire entries without changing the Markdown. */
function parseAgentSource(value: unknown): AgentSourceEntry | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('type' in value) ||
    !('name' in value) ||
    !('content' in value)
  )
    return;
  const { type, name: rawName, content } = value;
  const rawDescription = 'description' in value ? value.description : undefined;
  if (type !== 'instruction' && type !== 'skill') return;
  if (typeof rawName !== 'string' || typeof content !== 'string') return;
  const name = rawName.trim();
  if (
    !name ||
    name.length > MAX_NAME_LENGTH ||
    content.length > MAX_CONTENT_LENGTH ||
    !content.trim()
  ) {
    return;
  }
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';
  return description && description.length <= MAX_DESCRIPTION_LENGTH
    ? { type, name, description, content }
    : { type, name, content };
}

export function collectAgentSources(values: Iterable<unknown>): AgentSourceEntry[] {
  const entries: AgentSourceEntry[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const entry = parseAgentSource(value);
    if (!entry) continue;
    const key = JSON.stringify([entry.type, entry.name]);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries;
}
