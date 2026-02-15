import type { InternalModelContext } from '@mcp-b/global';
import { initializeWebModelContext } from '@mcp-b/global';
import { z } from 'zod';

const statusEl = document.getElementById('status')!;
const resultsEl = document.getElementById('results')!;
const toolsListEl = document.getElementById('tools-list')!;
const zodVersionEl = document.getElementById('zod-version')!;

function log(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  const div = document.createElement('div');
  div.className = `result-item ${type}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  resultsEl.appendChild(div);
  resultsEl.scrollTop = resultsEl.scrollHeight;
}

function getFirstText(result: { content?: Array<{ type?: string; text?: string }> }): string {
  const textBlock = result.content?.find(
    (item) => item.type === 'text' && typeof item.text === 'string'
  );
  return textBlock?.text ?? '';
}

// Check Zod version
const testSchema = z.string();
const isZod4 = '_zod' in testSchema;
const isZod3 = '_def' in testSchema && !isZod4;
zodVersionEl.innerHTML = `
  <p style="color: ${isZod3 ? '#22543d' : '#742a2a'}; font-weight: bold;">
    ${isZod3 ? '✓ Zod 3.x detected (correct)' : isZod4 ? '✗ Zod 4.x detected (wrong!)' : '✗ Unknown Zod version'}
  </p>
  <p style="color: #718096; font-size: 0.85rem;">
    Has _def: ${!!(testSchema as any)._def}, Has _zod: ${'_zod' in testSchema}
  </p>
`;

if (!isZod3) {
  statusEl.className = 'error';
  statusEl.textContent = 'Wrong Zod version! Expected Zod 3.x';
  log('ERROR: Expected Zod 3.x but got different version', 'error');
  throw new Error('Wrong Zod version');
}

// Initialize modelContext
initializeWebModelContext();

async function runTests() {
  if (!window.navigator.modelContext) {
    statusEl.className = 'error';
    statusEl.textContent = 'modelContext not available';
    return;
  }

  statusEl.className = 'success';
  statusEl.textContent = 'ESM + Zod 3 initialized - Running tests...';

  const mc = window.navigator.modelContext as unknown as InternalModelContext;
  const registerTool = mc.registerTool as unknown as (tool: unknown) => void;

  try {
    // Register tool with Zod 3 schemas
    registerTool({
      name: 'esm-zod3-validator',
      description: 'Validate data using ESM + Zod 3',
      inputSchema: {
        name: z.string().min(2).max(50).describe('Name (2-50 chars)'),
        email: z.string().email().describe('Valid email'),
        score: z.number().min(0).max(100).describe('Score (0-100)'),
        active: z.boolean().optional().describe('Is active'),
        tags: z.array(z.string()).optional().describe('Optional tags'),
      },
      async execute(args: {
        name: string;
        email: string;
        score: number;
        active?: boolean;
        tags?: string[];
      }) {
        const { name, email, score, active, tags } = args;
        return {
          content: [
            {
              type: 'text',
              text: `ESM Zod3: name=${name}, email=${email}, score=${score}, active=${active ?? 'unset'}, tags=${tags?.join(',') || 'none'}`,
            },
          ],
        };
      },
    });
    log('Tool "esm-zod3-validator" registered successfully', 'success');

    // Update tools list
    const tools = await mc.listTools();
    toolsListEl.innerHTML = tools
      .map(
        (t: { name: string; description?: string }) =>
          `<div style="padding: 0.5rem; background: white; border-radius: 4px; margin-bottom: 0.5rem;">
            <strong>${t.name}</strong> - ${t.description || 'No description'}
          </div>`
      )
      .join('');

    // Test 1: Valid input
    log('Test 1: Valid input...', 'info');
    const r1 = await mc.executeTool('esm-zod3-validator', {
      name: 'John Doe',
      email: 'john@example.com',
      score: 85,
    });
    log(
      `Valid input: ${r1.isError ? 'FAILED' : 'PASSED'} - ${getFirstText(r1 as { content?: Array<{ type?: string; text?: string }> })}`,
      r1.isError ? 'error' : 'success'
    );

    // Test 2: Valid with optional fields
    log('Test 2: Valid input with optional fields...', 'info');
    const r2 = await mc.executeTool('esm-zod3-validator', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      score: 92,
      active: true,
      tags: ['premium', 'verified'],
    });
    log(
      `With optionals: ${r2.isError ? 'FAILED' : 'PASSED'} - ${getFirstText(r2 as { content?: Array<{ type?: string; text?: string }> })}`,
      r2.isError ? 'error' : 'success'
    );

    // Test 3: Missing required field
    log('Test 3: Missing required field (email)...', 'info');
    const r3 = await mc.executeTool('esm-zod3-validator', {
      name: 'Test User',
      score: 50,
    });
    log(
      `Missing email: ${r3.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r3.isError ? 'success' : 'error'
    );

    // Test 4: Invalid type
    log('Test 4: Invalid type (score as string)...', 'info');
    const r4 = await mc.executeTool('esm-zod3-validator', {
      name: 'Test User',
      email: 'test@example.com',
      score: 'high',
    });
    log(
      `Invalid type: ${r4.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r4.isError ? 'success' : 'error'
    );

    // Test 5: Value out of range
    log('Test 5: Value out of range (score=150)...', 'info');
    const r5 = await mc.executeTool('esm-zod3-validator', {
      name: 'Test User',
      email: 'test@example.com',
      score: 150,
    });
    log(
      `Score too high: ${r5.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r5.isError ? 'success' : 'error'
    );

    // Test 6: String too short
    log('Test 6: String too short (name="A")...', 'info');
    const r6 = await mc.executeTool('esm-zod3-validator', {
      name: 'A',
      email: 'test@example.com',
      score: 50,
    });
    log(
      `Name too short: ${r6.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r6.isError ? 'success' : 'error'
    );

    // Test 7: Invalid email
    log('Test 7: Invalid email format...', 'info');
    const r7 = await mc.executeTool('esm-zod3-validator', {
      name: 'Test User',
      email: 'not-an-email',
      score: 50,
    });
    log(
      `Invalid email: ${r7.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r7.isError ? 'success' : 'error'
    );

    // Test 8: Invalid boolean type
    log('Test 8: Invalid boolean type (active="yes")...', 'info');
    const r8 = await mc.executeTool('esm-zod3-validator', {
      name: 'Test User',
      email: 'test@example.com',
      score: 50,
      active: 'yes',
    });
    log(
      `Invalid boolean: ${r8.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r8.isError ? 'success' : 'error'
    );

    statusEl.textContent = 'All tests completed!';
    log('All tests completed!', 'success');
  } catch (error) {
    log(`Error: ${(error as Error).message}`, 'error');
    console.error(error);
  }
}

// Run tests when page loads
runTests();
