import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  clearMocks: true,
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['\\\\node_modules\\\\'],
  moduleFileExtensions: ['js', 'ts'],
  rootDir: './',
  moduleDirectories: ['node_modules'],
  modulePaths: ['<rootDir>src'],
  testMatch: [
    // Обнаружил разницу между МАК ОС и ВИНДОУС!!!
    '<rootDir>src/**/*(*.)@(spec|test).[t]s?(x)',
  ],
  preset: 'ts-jest',
  // setupFilesAfterEnv: ['<rootDir>config/jest/setupTests.ts'],
};
export default config;
