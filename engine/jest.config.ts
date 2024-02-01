import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest/presets/default-esm',
    moduleNameMapper: {
        '^#lostcity/(.*).js$': '<rootDir>/src/lostcity/$1',
        '^#jagex2/(.*).js$': '<rootDir>/src/jagex2/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },

    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                useESM: true
            }
        ]
    }
};

export default config;
