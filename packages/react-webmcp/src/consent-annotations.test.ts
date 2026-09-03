import { describe, expect, it } from 'vitest';
import { toMcpAnnotations } from './consent-annotations.js';
import type { ConsentMetadata } from './consent-types.js';

describe('toMcpAnnotations', () => {
  it('low-risk + reversible → readOnly, idempotent, not destructive', () => {
    const consent: ConsentMetadata = {
      scope: ['read:deployments'],
      reversible: true,
      riskLevel: 'low',
      requiresApproval: false,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('medium-risk + reversible → not readOnly, idempotent, not destructive', () => {
    const consent: ConsentMetadata = {
      scope: ['write:deployments'],
      reversible: true,
      riskLevel: 'medium',
      requiresApproval: true,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('high-risk + irreversible → not readOnly, destructive, not idempotent', () => {
    const consent: ConsentMetadata = {
      scope: ['write:rollback'],
      reversible: false,
      riskLevel: 'high',
      requiresApproval: true,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
  });

  it('high-risk + reversible → not readOnly, not destructive, not idempotent', () => {
    // High-risk reversible (e.g. forced rollback that CAN be undone, but risky to repeat)
    const consent: ConsentMetadata = {
      scope: ['write:rollback'],
      reversible: true,
      riskLevel: 'high',
      requiresApproval: true,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false, // high-risk excluded from idempotent even when reversible
    });
  });
});
