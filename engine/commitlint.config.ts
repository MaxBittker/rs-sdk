import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';

/**
 * https://commitlint.js.org/reference/configuration.html
 */
const Configuration: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    formatter: '@commitlint/format',
    rules: {
        'subject-case': [RuleConfigSeverity.Disabled, 'always', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    }
};

export default Configuration;
