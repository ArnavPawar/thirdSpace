module.exports = {
  extends: ['expo'],
  ignorePatterns: ['dist/*'],
  rules: {
    'import/namespace': 'off',
    'import/no-unresolved': 'off',
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/immutability': 'off',
  },
};
