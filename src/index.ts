import { TSESTree, AST_NODE_TYPES, parse, simpleTraverse } from '@typescript-eslint/typescript-estree'

export function declassify(source: string): string {
  const ast = parse(source, {
    loc: true,
    range: true,
  })

  function enter(node: TSESTree.Node, parent: TSESTree.Node) {
    console.log(node.type)
  }

  simpleTraverse(ast, { enter }, true)
  return source
}
