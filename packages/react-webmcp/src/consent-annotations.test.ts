import { describe, expect, it } from 'vitest';
import { toMcpAnnotations } from './consent-annotations.js';
import type { ConsentMetadata } from './consent-types.js';

describe('toMcpAnnotations', () => {
  it('low-risk + reversible + idempotent: true → readOnly, idempotent, not destructive', () => {
    const consent: ConsentMetadata = {
      scope: ['read:deployments'],
      reversible: true,
      riskLevel: 'low',
      requiresApproval: false,
      idempotent: true,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('medium-risk + reversible + idempotent: true → not readOnly, idempotent, not destructive', () => {
    const consent: ConsentMetadata = {
      scope: ['write:deployments'],
      reversible: true,
      riskLevel: 'medium',
      requiresApproval: true,
      idempotent: true,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  it('high-risk + irreversible + idempotent omitted → not readOnly, destructive, not idempotent', () => {
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

  it('high-risk + reversible + idempotent: false → not readOnly, not destructive, not idempotent', () => {
    const consent: ConsentMetadata = {
      scope: ['write:rollback'],
      reversible: true,
      riskLevel: 'high',
      requiresApproval: true,
      idempotent: false,
    };

    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
  });

  it('idempotent: true is passed through regardless of reversible/riskLevel', () => {
    const consent: ConsentMetadata = {
      scope: ['write:archive'],
      reversible: false,
      riskLevel: 'medium',
      requiresApproval: true,
      idempotent: true,
    };
    expect(toMcpAnnotations(consent)).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it('reversible does not imply idempotentHint when idempotent is false or omitted', () => {
    const reversibleNonIdempotent: ConsentMetadata = {
      scope: ['write:counter'],
      reversible: true,
      riskLevel: 'medium',
      requiresApproval: true,
      idempotent: false,
    };
    expect(toMcpAnnotations(reversibleNonIdempotent).idempotentHint).toBe(false);

    const reversibleOmitted: ConsentMetadata = {
      scope: ['write:counter'],
      reversible: true,
      riskLevel: 'low',
      requiresApproval: false,
    };
    expect(toMcpAnnotations(reversibleOmitted).idempotentHint).toBe(false);
  });
});
