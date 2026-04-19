/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^server-only$": "<rootDir>/jest.server-only-stub.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          strict: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
};
