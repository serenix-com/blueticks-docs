import { describe, it, expect } from 'vitest';
import { guideFiles } from '../../validate-examples';

describe('guideFiles', () => {
  it('includes nested guide MDX and excludes generated api pages', () => {
    const files = guideFiles('content/docs');
    expect(files.some((f) => f.includes('content/docs/api/'))).toBe(false);
    expect(files.every((f) => f.endsWith('.mdx'))).toBe(true);
  });
});
