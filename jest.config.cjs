/** @type {import('jest').Config} */
module.exports = {
  collectCoverageFrom: ['src/**/*.ts'],
  testRegex: 'tests/.*\\.test\\.ts$',
  transform: {
    '^.+\\.ts$': '@swc/jest',
  },
  extensionsToTreatAsEsm: ['.ts'],
  watchAll: true,
};
