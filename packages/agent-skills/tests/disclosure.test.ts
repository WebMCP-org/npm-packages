import { describe, expect, it } from 'vitest';
import { handleSkillRead, toReadToolSchema } from '../src/disclosure';
import type { ResolvedSkill } from '../src/models';

const skillFixture: ResolvedSkill = {
  name: 'pizza-maker',
  description: 'Interactive pizza builder.',
  body: 'Read [build-pizza](references/build-pizza) for full steps.',
  resources: [
    {
      name: 'build-pizza',
      path: 'references/build-pizza',
      content: 'Step 1: Prepare dough.',
    },
  ],
};

describe('handleSkillRead', () => {
  it('returns skill body when resource is not provided', () => {
    const result = handleSkillRead([skillFixture], { name: 'pizza-maker' });

    expect(result).toEqual({
      ok: true,
      content: 'Read [build-pizza](references/build-pizza) for full steps.',
    });
  });

  it('returns resource content when resource is provided', () => {
    const result = handleSkillRead([skillFixture], {
      name: 'pizza-maker',
      resource: 'build-pizza',
    });

    expect(result).toEqual({
      ok: true,
      content: 'Step 1: Prepare dough.',
    });
  });

  it('returns structured error when skill does not exist', () => {
    const result = handleSkillRead([skillFixture], { name: 'missing-skill' });

    expect(result).toEqual({
      ok: false,
      code: 'SKILL_NOT_FOUND',
      error: 'Skill "missing-skill" not found.',
    });
  });

  it('returns structured error when resource does not exist', () => {
    const result = handleSkillRead([skillFixture], {
      name: 'pizza-maker',
      resource: 'missing-resource',
    });

    expect(result).toEqual({
      ok: false,
      code: 'RESOURCE_NOT_FOUND',
      error: 'Resource "missing-resource" not found in skill "pizza-maker".',
    });
  });
});

describe('toReadToolSchema', () => {
  it('builds deterministic read tool schema with strict object validation', () => {
    const schema = toReadToolSchema([{ name: 'pizza-maker' }, { name: 'pizza-maker' }]);

    expect(schema.name).toBe('read_skill');
    expect(schema.description).toContain('Read skill context');
    expect(schema.parametersJsonSchema).toEqual({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the skill to read',
          enum: ['pizza-maker'],
        },
        resource: {
          type: 'string',
          description: 'Optional: name of a specific resource within the skill',
        },
      },
      required: ['name'],
      additionalProperties: false,
    });
  });

  it('supports tool name and description overrides', () => {
    const schema = toReadToolSchema([{ name: 'pizza-maker' }], {
      toolName: 'read_site_context',
      description: 'Read site-specific skill content.',
    });

    expect(schema.name).toBe('read_site_context');
    expect(schema.description).toBe('Read site-specific skill content.');
  });
});
