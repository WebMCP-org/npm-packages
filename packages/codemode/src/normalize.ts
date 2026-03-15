export type CodeNormalizer = (code: string) => string;

const DEFAULT_ASYNC_ARROW = 'async () => {}';
const ARROW_FUNCTION_PATTERN = /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>[\s\S]*;?$/;
const NAMED_FUNCTION_PATTERN = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

function stripCodeFences(code: string): string {
  const fenced = /^```(?:js|javascript|typescript|ts|tsx|jsx)?\s*\n([\s\S]*?)```\s*$/;
  const match = code.match(fenced);
  return match?.[1] ?? code;
}

function stripExportDefault(code: string): string {
  return code.replace(/^export\s+default\s+/, '');
}

function canParseExpression(code: string): boolean {
  try {
    // Parse without executing by compiling an async wrapper expression.
    new Function(`return (async () => (${code}));`);
    return true;
  } catch {
    return false;
  }
}

export function normalizeCode(code: string): string {
  const trimmed = stripCodeFences(code.trim()).trim();
  if (!trimmed) return DEFAULT_ASYNC_ARROW;

  const source = trimmed;
  const unwrappedExportDefault = source.startsWith('export default ')
    ? stripExportDefault(source)
    : source;

  if (unwrappedExportDefault !== source) {
    return normalizeCode(unwrappedExportDefault);
  }

  if (ARROW_FUNCTION_PATTERN.test(source)) {
    return source;
  }

  const namedFunction = source.match(NAMED_FUNCTION_PATTERN);
  if (namedFunction?.[1]) {
    return `async () => {\n${source}\nreturn ${namedFunction[1]}();\n}`;
  }

  const withoutTrailingSemicolon = source.replace(/;\s*$/, '');
  if (canParseExpression(withoutTrailingSemicolon)) {
    return `async () => {\nreturn (${withoutTrailingSemicolon})\n}`;
  }

  return `async () => {\n${source}\n}`;
}
