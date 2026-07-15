import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^next/navigation$': '<rootDir>/src/__mocks__/next-navigation.ts',
    '^next/link$': '<rootDir>/src/__mocks__/next-link.ts',
    '^@/providers/ThemeProvider$': '<rootDir>/src/__mocks__/theme-provider.ts',
    '^gsap$': '<rootDir>/src/__mocks__/gsap.ts',
  },
  testTimeout: 10000,
  verbose: true,
};

export default config;
