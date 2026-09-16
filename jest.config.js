/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/\\.claude/'],
    modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
};
