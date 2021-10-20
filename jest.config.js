/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: [
    "node_modules"
  ],
  reporters: [
    "default", 
    ["jest-junit", {outputDirectory: './junit/'}],
  ],
  resetMocks: true,
  resetModules: false,
  testPathIgnorePatterns: [
    "/node_modules/"
  ],
}
