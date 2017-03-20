'use strict'

module.exports = {
    'globals': [
        'document',
        'navigator',
        'window'
    ],

    'envs': ['es6', 'browser', 'worker', 'serviceworker'],

    'parserOptions': {
        'ecmaFeatures': {
            'experimentalObjectRestSpread': true,
            'jsx': true
        },
        'ecmaVersion': 8,
        'sourceType': 'module'
    },

    'rules': {
        'eqeqeq': ['error', 'always', {'null': 'ignore'}],
        'no-invalid-regexp': 'error',
        'no-irregular-whitespace': 'error',
        'no-iterator': 'error',
        'no-proto': 'error',
        'no-redeclare': 'error',
        'no-return-assign': ['error', 'except-parens'],
        'no-return-await': 'error',
        'no-self-assign': 'error',
        'no-self-compare': 'error',
        'no-sequences': 'error',
        'no-shadow-restricted-names': 'error',
        'no-sparse-arrays': 'error',
        'no-template-curly-in-string': 'error',
        'no-this-before-super': 'error',
        'no-throw-literal': 'error',
        'no-undef': 'error',
        'no-undef-init': 'error',
        'no-unexpected-multiline': 'error',
        'no-unneeded-ternary': ['error', {'defaultAssignment': false}],
        'no-unreachable': 'error',
        'no-unsafe-finally': 'error',
        'no-unsafe-negation': 'error',
        'no-unused-expressions': ['error', {
            'allowShortCircuit': true,
            'allowTaggedTemplates': true,
            'allowTernary': true
        }],
        'no-unused-vars': ['error', {
            'args': 'none',
            'ignoreRestSiblings': true,
            'vars': 'all'
        }],
        'no-use-before-define': ['error', {
            'classes': false,
            'functions': false,
            'variables': false
        }],
        'no-useless-call': 'error',
        'no-useless-computed-key': 'error',
        'no-useless-constructor': 'error',
        'no-useless-escape': 'error',
        'no-useless-rename': 'error',
        'no-useless-return': 'error',
        'no-with': 'error',
        'symbol-description': 'error',
        'valid-typeof': ['error', {'requireStringLiterals': true}]
    }
}
