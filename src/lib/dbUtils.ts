/**
 * Sanitizes a value to be compatible with SQLite.
 * - undefined -> null
 * - true -> 1, false -> 0
 * - Infinity, -Infinity, NaN -> null
 * - Objects/Arrays -> JSON string
 * @param value The value to sanitize.
 * @returns The sanitized value.
 */
export const sanitizeForSQLite = (value: any): any => {
  if (value === undefined) {
    return null;
  }
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  if (value === Infinity || value === -Infinity || Number.isNaN(value)) {
    return null;
  }
  // If it's an object or array, convert to JSON string
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}; 