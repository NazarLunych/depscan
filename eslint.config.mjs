import nextConfig from 'eslint-config-next/core-web-vitals'
import eslintConfigPrettier from 'eslint-config-prettier'

function isFunctionExpressionNode(node) {
  return Boolean(node) && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')
}

function isFunctionValue(node) {
  if (!node) {
    return false
  }

  if (isFunctionExpressionNode(node)) {
    return true
  }

  return node.type === 'CallExpression' && node.arguments.some(isFunctionExpressionNode)
}

function isFunctionDeclarator(declaration) {
  return (
    declaration.type === 'VariableDeclaration' &&
    declaration.declarations.length === 1 &&
    isFunctionValue(declaration.declarations[0].init)
  )
}

function isVariableDeclarationOfKind(node) {
  return node.type === 'VariableDeclaration' && (node.kind === 'const' || node.kind === 'let')
}

/** @type {import('eslint').ESLint.Plugin} */
const localPlugin = {
  rules: {
    'padding-between-const-let': {
      meta: {
        type: 'layout',
        fixable: 'whitespace',
        schema: [],
      },
      create(context) {
        const sourceCode = context.sourceCode

        function checkPair(prevNode, node) {
          if (!isVariableDeclarationOfKind(prevNode) && !isVariableDeclarationOfKind(node)) {
            return
          }

          const prevIsFn = isVariableDeclarationOfKind(prevNode) && isFunctionDeclarator(prevNode)
          const nodeIsFn = isVariableDeclarationOfKind(node) && isFunctionDeclarator(node)
          const bothPlainDeclarations =
            isVariableDeclarationOfKind(prevNode) && isVariableDeclarationOfKind(node)

          if (!bothPlainDeclarations && !prevIsFn) {
            return
          }

          const shouldHaveBlankLine = prevIsFn || nodeIsFn
          const prevToken = sourceCode.getLastToken(prevNode)
          const firstToken = sourceCode.getFirstToken(node, { includeComments: true })
          const between = sourceCode.text.slice(prevToken.range[1], firstToken.range[0])
          const hasBlankLine = /\n\s*\n/u.test(between)

          if (shouldHaveBlankLine && !hasBlankLine) {
            context.report({
              node,
              message: 'Expect blank line around a function/hook const or let declaration.',
              fix(fixer) {
                return fixer.insertTextAfter(prevToken, '\n')
              },
            })
          } else if (bothPlainDeclarations && !shouldHaveBlankLine && hasBlankLine) {
            context.report({
              node,
              message: 'Unexpected blank line between const/let declarations.',
              fix(fixer) {
                const collapsed = between.replace(/\n\s*\n+/u, '\n')

                return fixer.replaceTextRange([prevToken.range[1], firstToken.range[0]], collapsed)
              },
            })
          }
        }

        function checkStatementsList(body) {
          for (let i = 1; i < body.length; i += 1) {
            checkPair(body[i - 1], body[i])
          }
        }

        return {
          Program(node) {
            checkStatementsList(node.body)
          },
          BlockStatement(node) {
            checkStatementsList(node.body)
          },
          StaticBlock(node) {
            checkStatementsList(node.body)
          },
          SwitchCase(node) {
            checkStatementsList(node.consequent)
          },
        }
      },
    },
  },
}

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextConfig,
  {
    plugins: {
      local: localPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAnyKeyword',
          message: 'NEVER write `any` — use unknown or a concrete type.',
        },
      ],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: 'if' },
        { blankLine: 'always', prev: ['if', 'for', 'while', 'switch', 'try'], next: '*' },
      ],
      'local/padding-between-const-let': 'error',
    },
  },
  eslintConfigPrettier,
]

export default eslintConfig
