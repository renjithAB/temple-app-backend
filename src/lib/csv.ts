/**
 * Sanitizes a CSV cell to prevent formula injection / CSV injection vulnerabilities.
 * Prepend a single quote if the value starts with =, +, -, @, or \t
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value).trim();

  // If cell starts with formula trigger characters, prefix with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes
  str = str.replace(/"/g, '""');

  return `"${str}"`;
}

export function generateCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerRow = headers.map(sanitizeCsvCell).join(',');
  const dataRows = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  return [headerRow, ...dataRows].join('\r\n');
}
