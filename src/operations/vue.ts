import { ClassDeclaration, Decorator, SourceFile, SyntaxKind, ts } from 'ts-morph'

const scratchpad = ts.createSourceFile('', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
const printer = ts.createPrinter()

function print(node: ts.Node, hint: ts.EmitHint = ts.EmitHint.Unspecified) {
  return printer.printNode(hint, node, scratchpad)
}

function extract(source: SourceFile) {
  const defaultExport = source.getDefaultExportSymbol()

  if (!defaultExport) {
    return
  }

  const declaration = defaultExport.getValueDeclaration() as ClassDeclaration

  if (declaration.getKind() !== SyntaxKind.ClassDeclaration) {
    return
  }

  const decorator = declaration.getDecorator('Component')

  if (!decorator) {
    return
  }

  return {
    declaration,
    decorator,
  }
}

function unpackDecorator(decorator: Decorator) {
  let decoratorConfig = ts.factory.createObjectLiteralExpression()
  const decoratorArguments = decorator.getArguments()

  if (decoratorArguments.length > 0) {
    const initialDecoratorArgument = decoratorArguments[0]

    if (initialDecoratorArgument.getKind() !== SyntaxKind.ObjectLiteralExpression) {
      throw new Error('The first argument to @Component is not an object literal.')
    }

    decoratorConfig = initialDecoratorArgument.compilerNode as ts.ObjectLiteralExpression
  }

  return {
    decoratorConfig,
  }
}

export function classToObject(source: SourceFile) {
  const requirements = extract(source)

  if (!requirements) {
    return
  }

  const { declaration, decorator } = requirements
  const { decoratorConfig } = unpackDecorator(decorator)
  
  const properties: ts.ObjectLiteralElementLike[] = []

  // Write the component name in first, copying it from the class name.
  properties.push(
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier('name'),
      ts.factory.createStringLiteral(declaration.getName(), true),
    )
  )

  // Add any properties we inherited from the original decorator's configuration.
  properties.push(...decoratorConfig.properties)

  // Wrap the properties up in a call to Vue.extend().
  const component = ts.factory.createCallExpression(
    ts.factory.createIdentifier('Vue.extend'),
    [],
    [ts.factory.createObjectLiteralExpression(properties, true)]
  )

  // Remove the class now that we're done porting it to the statement.
  declaration.remove()

  // Add the new default export statement, printing from the object AST.
  source.addExportAssignment({
    isExportEquals: false,
    expression: print(component),
  }).formatText()
}
