/* eslint-disable */
export let inspect: (
  obj: unknown,
  options?: {colors?: boolean; depth?: number}
) => string;

try {
  // biome-ignore lint/nursery/noCommonJs: CommonJS is used here to load the native module
  inspect = require('node:util').inspect;
  if (typeof inspect !== 'function') {
    throw new Error('Failed to load inspect');
  }
} catch {
  inspect = (obj) => {
    return Array.isArray(obj) ||
      !obj ||
      Object.getPrototypeOf(obj) === null ||
      Object.getPrototypeOf(obj) === Object.prototype
      ? JSON.stringify(obj)
      : String(obj);
  };
}
