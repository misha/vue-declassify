import { ClassDeclaration, ClassInstancePropertyTypes, Decorator, ObjectLiteralExpression, PropertyDeclaration, SourceFile, SyntaxKind, ts } from 'ts-morph'

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
  let decoratorConfig: ObjectLiteralExpression | undefined = undefined
  const decoratorArguments = decorator.getArguments()

  if (decoratorArguments.length > 0) {
    const initialDecoratorArgument = decoratorArguments[0]

    if (initialDecoratorArgument instanceof ObjectLiteralExpression) {
      decoratorConfig = initialDecoratorArgument
    
    } else {
      throw new Error('The first argument to @Component is not an object literal.')
    }
  }

  return {
    decoratorConfig,
  }
}

function unpackClass(declaration: ClassDeclaration) {
  const props: {
    property: PropertyDeclaration
    decorator: Decorator
  }[] = []

  const data: PropertyDeclaration[] = []

  for (const property of declaration.getInstanceProperties()) {
    if (property instanceof PropertyDeclaration) {
      const decorator = property.getDecorator('Prop')
      
      if (decorator) {
        props.push({
          property: property as PropertyDeclaration,
          decorator,
        })

      } else {
        data.push(property)
      }
    }
  }

  return {
    props,
  }
}

function classPropToObjectProp(property: PropertyDeclaration, decorator: Decorator) {
  return ts.factory.createPropertyAssignment(
    ts.factory.createIdentifier(property.getName()),
    ts.factory.createObjectLiteralExpression(
      [],
      true,
    ),
  )
}

export function classToObject(source: SourceFile) {
  const requirements = extract(source)

  if (!requirements) {
    return
  }

  const { declaration, decorator } = requirements
  const { decoratorConfig } = unpackDecorator(decorator)
  const { props } = unpackClass(declaration)
  
  const properties: ts.ObjectLiteralElementLike[] = []

  // Write the component name in first, copying it from the class name.
  properties.push(
    ts.factory.createPropertyAssignment(
      ts.factory.createIdentifier('name'),
      ts.factory.createStringLiteral(declaration.getName(), true),
    )
  )

  // Add any properties we inherited from the @Component decorator
  if (decoratorConfig) {
    properties.push(...decoratorConfig.compilerNode.properties)
  }

  // Construct the props using any @Prop-annotated fields.
  if (props.length > 0) {
    properties.push(
      ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier('props'),
        ts.factory.createObjectLiteralExpression(
          props.map(prop => classPropToObjectProp(prop.property, prop.decorator)),
          true,
        ),
      )
    )
  }

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
