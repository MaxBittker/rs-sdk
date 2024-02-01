module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true
    },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    overrides: [
        {
            env: {
                node: true
            },
            files: ['.eslintrc.{js,cjs}'],
            parserOptions: {
                sourceType: 'script'
            }
        }
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
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
         * (jkm) we should not use ts-ignore because it can hide errors
         * recommend to fix these urgently
         * (I didn't want to fix and risk breaking the code)
         */
        '@typescript-eslint/ban-ts-comment': 'warn',

        /**
         * (jkm)
         * The following rules are included in @typescript-eslint/recommended
         * I have set them to warn instead of error, to avoid having to fix them
         * We should consider fixing them and setting them to error
         */
        '@typescript-eslint/no-namespace': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-unused-vars': 'warn'
    }
};
