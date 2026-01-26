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

// Check Zod version
const testSchema = z.string();
const isZod4 = '_zod' in testSchema;
const hasNativeToJSONSchema = typeof (z as any).toJSONSchema === 'function';
zodVersionEl.innerHTML = `
  <p style="color: ${isZod4 ? '#22543d' : '#742a2a'}; font-weight: bold;">
    ${isZod4 ? '✓ Zod 4.x detected (correct)' : '✗ Zod 3.x detected (wrong!)'}
  </p>
  <p style="color: #718096; font-size: 0.85rem;">
    Has _zod: ${'_zod' in testSchema}, Has native toJSONSchema: ${hasNativeToJSONSchema}
  </p>
`;

if (!isZod4) {
  statusEl.className = 'error';
  statusEl.textContent = 'Wrong Zod version! Expected Zod 4.x';
  log('ERROR: Expected Zod 4.x but got different version', 'error');
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
  statusEl.textContent = 'ESM + Zod 4 initialized - Running tests...';

  const mc = window.navigator.modelContext;

  try {
    // Register tool with Zod 4 schemas
    mc.registerTool({
      name: 'esm-zod4-validator',
      description: 'Validate data using ESM + Zod 4',
      inputSchema: {
        name: z.string().min(2).max(50).describe('Name (2-50 chars)'),
        email: z.string().email().describe('Valid email'),
        score: z.number().min(0).max(100).describe('Score (0-100)'),
        active: z.boolean().optional().describe('Is active'),
        tags: z.array(z.string()).optional().describe('Optional tags'),
        profile: z
          .object({
            bio: z.string().optional(),
            website: z.string().url().optional(),
          })
          .optional()
          .describe('Optional profile'),
      },
      async execute({ name, email, score, active, tags, profile }) {
        return {
          content: [
            {
              type: 'text',
              text: `ESM Zod4: name=${name}, email=${email}, score=${score}, active=${active ?? 'unset'}, tags=${tags?.join(',') || 'none'}, profile=${JSON.stringify(profile) || 'none'}`,
            },
          ],
        };
      },
    });
    log('Tool "esm-zod4-validator" registered successfully', 'success');

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
    const r1 = await mc.executeTool('esm-zod4-validator', {
      name: 'John Doe',
      email: 'john@example.com',
      score: 85,
    });
    log(
      `Valid input: ${r1.isError ? 'FAILED' : 'PASSED'} - ${r1.content?.[0]?.text}`,
      r1.isError ? 'error' : 'success'
    );

    // Test 2: Valid with all optional fields
    log('Test 2: Valid input with all optional fields...', 'info');
    const r2 = await mc.executeTool('esm-zod4-validator', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      score: 92,
      active: true,
      tags: ['premium', 'verified'],
      profile: { bio: 'Hello world', website: 'https://example.com' },
    });
    log(
      `With optionals: ${r2.isError ? 'FAILED' : 'PASSED'} - ${r2.content?.[0]?.text}`,
      r2.isError ? 'error' : 'success'
    );

    // Test 3: Missing required field
    log('Test 3: Missing required field (email)...', 'info');
    const r3 = await mc.executeTool('esm-zod4-validator', {
      name: 'Test User',
      score: 50,
    });
    log(
      `Missing email: ${r3.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r3.isError ? 'success' : 'error'
    );

    // Test 4: Invalid type
    log('Test 4: Invalid type (score as string)...', 'info');
    const r4 = await mc.executeTool('esm-zod4-validator', {
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
    const r5 = await mc.executeTool('esm-zod4-validator', {
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
    const r6 = await mc.executeTool('esm-zod4-validator', {
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
    const r7 = await mc.executeTool('esm-zod4-validator', {
      name: 'Test User',
      email: 'not-an-email',
      score: 50,
    });
    log(
      `Invalid email: ${r7.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r7.isError ? 'success' : 'error'
    );

    // Test 8: Invalid nested URL
    log('Test 8: Invalid nested URL (profile.website)...', 'info');
    const r8 = await mc.executeTool('esm-zod4-validator', {
      name: 'Test User',
      email: 'test@example.com',
      score: 50,
      profile: { website: 'not-a-url' },
    });
    log(
      `Invalid URL: ${r8.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r8.isError ? 'success' : 'error'
    );

    // Test 9: Invalid array item
    log('Test 9: Invalid array item (tags with number)...', 'info');
    const r9 = await mc.executeTool('esm-zod4-validator', {
      name: 'Test User',
      email: 'test@example.com',
      score: 50,
      tags: ['valid', 123],
    });
    log(
      `Invalid array item: ${r9.isError ? 'PASSED (rejected)' : 'FAILED (should reject)'}`,
      r9.isError ? 'success' : 'error'
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
