import { describe, it, expect } from 'vitest';
import { sanitizeCsvCell, generateCsv } from '../../src/lib/csv.js';

describe('CSV Sanitization & Generation', () => {
  it('should neutralize formula injection triggers (=, +, -, @, \\t)', () => {
    expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe(`"'=SUM(A1:A10)"`);
    expect(sanitizeCsvCell('+cmd|')).toBe(`"'+cmd|"`);
    expect(sanitizeCsvCell('-10')).toBe(`"'-10"`);
    expect(sanitizeCsvCell('@link')).toBe(`"'@link"`);
  });

  it('should escape double quotes properly', () => {
    expect(sanitizeCsvCell('Hello "World"')).toBe(`"Hello ""World"""`);
  });

  it('should generate valid multi-row CSV with safe content', () => {
    const headers = ['Code', 'Devotee', 'Formula Attack'];
    const rows = [
      ['TMP-123456', 'Anand Nair', '=cmd|calc!A1'],
      ['TMP-654321', 'Devi Pillai', 'Normal Text'],
    ];

    const csv = generateCsv(headers, rows);
    expect(csv).toContain(`"Code","Devotee","Formula Attack"`);
    expect(csv).toContain(`"TMP-123456","Anand Nair","'=cmd|calc!A1"`);
    expect(csv).toContain(`"TMP-654321","Devi Pillai","Normal Text"`);
  });
});
