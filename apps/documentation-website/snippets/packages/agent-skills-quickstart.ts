import { parseSkillContent, validateSkillContent } from 'agent-skills-ts-sdk';

const content = `---
name: my-skill
description: A test skill
---
# My Skill

Instructions here.`;

const { properties, body } = parseSkillContent(content);

const errors = validateSkillContent(content);
if (errors.length > 0) {
  console.error('Validation errors:', errors);
}
