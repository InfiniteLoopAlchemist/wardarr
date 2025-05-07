// jest.config.mjs
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\.tsx?$': ['ts-jest', {
      // ts-jest configuration options
      tsconfig: 'tsconfig.json', // or your specific tsconfig file
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Optionally, specify test file patterns
  // testMatch: [
  //   '**/__tests__/**/*.+(ts|tsx|js)',
  //   '**/?(*.)+(spec|test).+(ts|tsx|js)',
  // ],
  // You might need to add moduleNameMapper for aliases if you use them in tsconfig.json
  // moduleNameMapper: {
  //   '^@/(.*)$': '<rootDir>/src/$1', // Example for an alias like @/components/*
  // },
}; 