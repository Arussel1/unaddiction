/** @type {import('jest').Config} */
module.exports = {
  testMatch: ["**/tests/**/*.test.js"],
  testEnvironment: "node",
  transform: {},
  // Map ES module imports to CommonJS for testing
  moduleNameMapper: {
    "^\\./firebase-config\\.js$": "<rootDir>/tests/__mocks__/firebase-config.js"
  }
};
