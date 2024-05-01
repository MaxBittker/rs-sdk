/**
 * TODO: Use flat config file as eslintrc is deprecated.
 * https://eslint.org/docs/latest/use/configure/configuration-files
 */
module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
    },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    overrides: [
        {
            env: {
                node: true,
            },
            files: ['.eslintrc.{js,cjs}'],
            parserOptions: {
                sourceType: 'script'
            }
        },
        {
            files: ['src/**/*.test.ts'],
            extends: ['plugin:vitest/legacy-recommended'],
            plugins: ['vitest'],
            rules: {
                'vitest/no-focused-tests': 'error',
                'vitest/no-disabled-tests': 'warn',
                'vitest/consistent-test-it': 'warn',
                'vitest/require-top-level-describe': [
                    'error',
                    {
                        'maxNumberOfTopLevelDescribes': 1
                    }
                ]
            }
        }
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint', 'unused-imports'],
    rules: {
        indent: ['error', 4, { SwitchCase: 1 }],
        quotes: ['error', 'single', { avoidEscape: true }],
        semi: ['error', 'always'],

        /**
         * https://eslint.org/docs/latest/rules/no-constant-condition#checkloops
         *
         * Allows constant conditions in loops but not in if statements
         */
        'no-constant-condition': ['error', { checkLoops: false }],

        /**
         * (jkm) this rule is included in the default ruleset, we should consider
         * resolving the issues and setting it to error
         * https://eslint.org/docs/latest/rules/no-case-declarations
         */
        'no-case-declarations': 'warn',

        /**
         * (jkm)
         * The following rules are included in @typescript-eslint/recommended
         * I have set them to warn instead of error, to avoid having to fix them
         * We should consider fixing them and setting them to error
         */
        '@typescript-eslint/no-namespace': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',

        /**
         * https://eslint.org/docs/latest/rules/no-unused-vars
         */
        '@typescript-eslint/no-unused-vars': [
            // TODO: Set to error
            'warn',
            {
                /**
                 * Allow variables prefixed with underscores to skip this rule.
                 * There aren't many good reasons to have unused variables,
                 * but the codebase has 100s of them.
                 */
                'vars': 'all',
                'varsIgnorePattern': '^_',
                /**
                * Allow parameters prefixed with underscores to skip this rule.
                * This is a common practice for router methods with req and res parameters.
                */
                'args': 'all',
                'argsIgnorePattern': '^_',
            }
        ],

        /**
         * https://github.com/sweepline/eslint-plugin-unused-imports
         */
        'unused-imports/no-unused-imports': 'error',
    }
};
