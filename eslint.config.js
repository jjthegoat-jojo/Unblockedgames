import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'dist_site/**/*', 'public/**/*', 'node_modules/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
