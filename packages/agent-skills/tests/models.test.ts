/**
 * Models tests
 *
 * Following TDD: Tests written BEFORE implementation
 * Reference: https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/models.py
 * Spec: https://agentskills.io/specification
 */

import { describe, expect, it } from 'vite-plus/test';
import type {
  ResolvedSkill,
  SkillFile,
  SkillMetadata,
  SkillProperties,
  SkillResource,
} from '../src/models';
import { skillPropertiesToDict } from '../src/models';

describe('SkillProperties', () => {
  it('should have required fields', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
    };
    expect(props.name).toBe('test-skill');
    expect(props.description).toBe('A test skill');
  });

  it('should support all optional fields', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      license: 'MIT',
      compatibility: 'Node.js 18+',
      allowedTools: 'Bash(git:*)',
      metadata: { author: 'Test Author', version: '1.0' },
    };
    expect(props.license).toBe('MIT');
    expect(props.compatibility).toBe('Node.js 18+');
    expect(props.allowedTools).toBe('Bash(git:*)');
    expect(props.metadata?.author).toBe('Test Author');
    expect(props.metadata?.version).toBe('1.0');
  });

  it('should allow undefined optional fields', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      license: undefined,
      compatibility: undefined,
      allowedTools: undefined,
      metadata: undefined,
    };
    expect(props.license).toBeUndefined();
    expect(props.compatibility).toBeUndefined();
    expect(props.allowedTools).toBeUndefined();
    expect(props.metadata).toBeUndefined();
  });
});

describe('skillPropertiesToDict', () => {
  it('should convert minimal properties to dict', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
    };
    const dict = skillPropertiesToDict(props);
    expect(dict).toEqual({
      name: 'test-skill',
      description: 'A test skill',
    });
    expect(Object.keys(dict)).toHaveLength(2);
  });

  it('should include license when present', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      license: 'MIT',
    };
    const dict = skillPropertiesToDict(props);
    expect(dict.license).toBe('MIT');
  });

  it('should exclude license when undefined', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      license: undefined,
    };
    const dict = skillPropertiesToDict(props);
    expect(dict).not.toHaveProperty('license');
  });

  it('should include compatibility when present', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      compatibility: 'Node.js 18+',
    };
    const dict = skillPropertiesToDict(props);
    expect(dict.compatibility).toBe('Node.js 18+');
  });

  it('should convert allowedTools to allowed-tools with hyphen', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      allowedTools: 'Bash(git:*)',
    };
    const dict = skillPropertiesToDict(props);
    expect(dict['allowed-tools']).toBe('Bash(git:*)');
    expect(dict).not.toHaveProperty('allowedTools');
  });

  it('should exclude empty metadata object', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      metadata: {},
    };
    const dict = skillPropertiesToDict(props);
    expect(dict).not.toHaveProperty('metadata');
  });

  it('should include non-empty metadata', () => {
    const props: SkillProperties = {
      name: 'test-skill',
      description: 'A test skill',
      metadata: { version: '1.0', author: 'Test' },
    };
    const dict = skillPropertiesToDict(props);
    expect(dict.metadata).toEqual({ version: '1.0', author: 'Test' });
  });

  it('should handle all fields together', () => {
    const props: SkillProperties = {
      name: 'complex-skill',
      description: 'A complex test skill',
      license: 'Apache-2.0',
      compatibility: 'Requires Docker',
      allowedTools: 'Bash(git:*) Bash(docker:*)',
      metadata: { author: 'Test', version: '2.0' },
    };
    const dict = skillPropertiesToDict(props);
    expect(dict).toEqual({
      name: 'complex-skill',
      description: 'A complex test skill',
      license: 'Apache-2.0',
      compatibility: 'Requires Docker',
      'allowed-tools': 'Bash(git:*) Bash(docker:*)',
      metadata: { author: 'Test', version: '2.0' },
    });
  });
});

describe('SkillFile', () => {
  it('should have all required properties', () => {
    const file: SkillFile = {
      id: 'abc123',
      content: '---\nname: test\ndescription: Test\n---\nBody',
      properties: {
        name: 'test',
        description: 'Test',
      },
      size: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(file.id).toBe('abc123');
    expect(file.content).toContain('name: test');
    expect(file.properties.name).toBe('test');
    expect(file.size).toBe(100);
    expect(file.createdAt).toBeGreaterThan(0);
    expect(file.updatedAt).toBeGreaterThan(0);
  });
});

describe('SkillMetadata', () => {
  it('should have all required properties', () => {
    const metadata: SkillMetadata = {
      id: 'abc123',
      name: 'test-skill',
      description: 'A test skill',
      metadataTokens: 50,
      fullTokens: 500,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(metadata.id).toBe('abc123');
    expect(metadata.name).toBe('test-skill');
    expect(metadata.description).toBe('A test skill');
    expect(metadata.metadataTokens).toBe(50);
    expect(metadata.fullTokens).toBe(500);
    expect(metadata.createdAt).toBeGreaterThan(0);
    expect(metadata.updatedAt).toBeGreaterThan(0);
  });

  it('should support optional fields', () => {
    const metadata: SkillMetadata = {
      id: 'abc123',
      name: 'test-skill',
      description: 'A test skill',
      license: 'MIT',
      compatibility: 'Node.js 18+',
      allowedTools: 'Bash(git:*)',
      metadata: { author: 'Test' },
      metadataTokens: 50,
      fullTokens: 500,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(metadata.license).toBe('MIT');
    expect(metadata.compatibility).toBe('Node.js 18+');
    expect(metadata.allowedTools).toBe('Bash(git:*)');
    expect(metadata.metadata?.author).toBe('Test');
  });
});

describe('SkillResource', () => {
  it('should represent a single tier-3 resource', () => {
    const resource: SkillResource = {
      name: 'build-pizza',
      path: 'references/build-pizza',
      content: 'Step 1',
    };

    expect(resource.name).toBe('build-pizza');
    expect(resource.path).toBe('references/build-pizza');
    expect(resource.content).toBe('Step 1');
  });
});

describe('ResolvedSkill', () => {
  it('should represent a fully resolved skill with resources', () => {
    const skill: ResolvedSkill = {
      name: 'pizza-maker',
      description: 'Interactive pizza builder',
      body: 'Use build-pizza',
      resources: [
        {
          name: 'build-pizza',
          path: 'references/build-pizza',
          content: 'Step 1',
        },
      ],
      location: '/skills/pizza-maker/SKILL.md',
    };

    expect(skill.name).toBe('pizza-maker');
    expect(skill.resources).toHaveLength(1);
    expect(skill.resources[0]?.path).toBe('references/build-pizza');
  });
});
