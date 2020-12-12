import { ClassDeclaration, NewLineKind, SourceFile, SyntaxKind, Node, ts } from 'ts-morph'

import { removeImport, ensureImport } from './operations/imports'

const scratchpad = ts.createSourceFile('', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
const printer = ts.createPrinter()

function print(node: ts.Node, hint: ts.EmitHint = ts.EmitHint.Unspecified) {
  return printer.printNode(hint, node, scratchpad)
}

export function declassify(source: SourceFile) {
  removeImport(source, 'vue-class-component')
  removeImport(source, 'vue-property-decorator')
  ensureImport(source, 'vue', { default: 'Vue' })

  const defaultExport = source.getDefaultExportSymbol()

  if (!defaultExport) {
    throw new Error('No default export. Is this really a Vue component?')
  }

  const componentClass = defaultExport.getValueDeclaration() as ClassDeclaration

  if (componentClass.getKind() !== SyntaxKind.ClassDeclaration) {
    throw new Error('Default export isn\'t a class. Already declassified?')
  }

  const componentDecorator = componentClass.getDecorator('Component')

  if (!componentDecorator) {
    throw new Error('No @Component decorator. Already declassified?')
  }

  const componentStatement = ts.factory.createCallExpression(
    ts.factory.createIdentifier('Vue.extend'),
    [],
    [
      ts.factory.createObjectLiteralExpression(
        [
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier('name'),
            ts.factory.createStringLiteral(componentClass.getName(), true),
          ),
        ],
        true,
      ),
    ],
  )

  // Remove the class now that we're done porting it to the statement.
  componentClass.remove()

  // Add the new default export statement, printing from the object AST.
  source.addExportAssignment({
    isExportEquals: false,
    expression: print(componentStatement),
  }).formatText()
}
