import { JSDoc, printNode, PropertyAssignment, PropertyDeclaration, SourceFile, SyntaxKind, ts } from 'ts-morph'

import * as vue_class from './vue_class'
import * as imports from './imports'

const f = ts.factory

function createDocumentation<T extends ts.Node>(target: T, docs: JSDoc[]) {
  
  // Unclear how to directly plop an entire, pre-rendered comment in front.
  // Forced to re-process the comment line-by-line to work with MultiLineCommentTriva.
  if (docs.length > 0) {
    return ts.addSyntheticLeadingComment(
      target, 
      SyntaxKind.MultiLineCommentTrivia, 
      '*\n' + // Starts with '/*'
        docs[0]
          .compilerNode
          .comment
          .split('\n')
          .map(line => ` * ${line}`)
          .join('\n')
      + '\n ', // Ends with '*/' 
      true,
    )
  }

  return target
}

function classPropTypeToObjectPropType(
  source: SourceFile,
  prop: {
    declaration: PropertyDeclaration
  }
): ts.PropertyAssignment {
  let initializer: ts.Expression
  const type = prop.declaration.getType()

  if (type.isString()) {
    initializer = f.createIdentifier('String')

  } else if (type.isNumber()) {
    initializer = f.createIdentifier('Number')
  
  } else if (type.isBoolean()) {
    initializer = f.createIdentifier('Boolean')

  } else {
    imports.ensure(source, 'vue', {
      named: ['PropType'],
    })

    initializer = f.createAsExpression(
      f.createIdentifier('Object'),
      f.createTypeReferenceNode(
        f.createIdentifier('PropType'),
        [
          prop.declaration.getTypeNode().compilerNode
        ]
      )
    )
  }

  return f.createPropertyAssignment(
    f.createIdentifier('type'),
    initializer,
  )
}

function classPropOptionsToObjectPropOptions(
  source: SourceFile,
  prop: {
    default?: PropertyAssignment
    required?: PropertyAssignment
  }
): ts.PropertyAssignment[] {
  
  // Only permit exactly one of `default` and `required`,
  // since a default value implies required is false in Vue.
  // There actually doesn't seem to be a use-case to set both!
  if (prop.default) {
    
    // Note: I really want to just pass the compiler node, but
    // for some reason `default` is special and does not render.
    // Probably has to do with `default` being a TS keyword.
    return [
      f.createPropertyAssignment(
        f.createIdentifier('default'),
        f.createIdentifier(prop.default.getInitializer().getText()),
      )
    ]

  } else if (prop.required) {
    return [prop.required.compilerNode]

  } else {

    // Lastly, if neither property is directly supplied, mark `required` false.
    // This is consistent with the vue-property-decorator defaults.
    return [
      f.createPropertyAssignment(
        f.createIdentifier('required'),
        f.createFalse(),
      )
    ]
  }
}

function classPropToObjectProp(
  source: SourceFile,
  prop: {
    declaration: PropertyDeclaration
    default?: PropertyAssignment
    required?: PropertyAssignment
  }
): ts.PropertyAssignment {
  return createDocumentation(
    f.createPropertyAssignment(
      f.createIdentifier(prop.declaration.getName()),
      f.createObjectLiteralExpression(
        [
          classPropTypeToObjectPropType(source, prop),
          ...classPropOptionsToObjectPropOptions(source, prop),
        ],
        true,
      ),
    ),
    prop.declaration.getJsDocs(),
  )
}

export function classToObject(source: SourceFile) {
  const vue = vue_class.extract(source)

  if (!vue) {
    return
  }

  const properties: ts.ObjectLiteralElementLike[] = []

  // Write the component name as the former class name.
  properties.push(
    f.createPropertyAssignment(
      f.createIdentifier('name'),
      f.createStringLiteral(vue.declaration.getName(), true),
    )
  )

  // Add any properties we inherited from the @Component decorator.
  // Note: this doesn't merge any Vue data that occurs in the class declaration.
  properties.push(...vue.decorator.properties.map(property => property.compilerNode))

  if (vue.props.length > 0) {
    properties.push(
      f.createPropertyAssignment(
        f.createIdentifier('props'),
        f.createObjectLiteralExpression(
          vue.props.map(prop => classPropToObjectProp(source, prop)),
          true,
        ),
      )
    )

    // TODO: handle @PropSync-generated props.
  }

  // Wrap the properties up in a call to Vue.extend().
  const component = f.createCallExpression(
    f.createIdentifier('Vue.extend'),
    [],
    [f.createObjectLiteralExpression(properties, true)]
  )

  // Save the docs.
  let documentation: string

  if (vue.declaration.getJsDocs().length > 0) {
    documentation = vue.declaration.getJsDocs()[0].getFullText()
  }

  // Remove the class now that we're done reading everything.
  vue.declaration.remove()

  // Add the new default export statement, printing from the object AST.
  const exportedComponent = source
    .addExportAssignment({
      expression: printNode(component),
      isExportEquals: false,
      leadingTrivia: writer => {
        if (documentation) {
          writer.writeLine(documentation)
        }
      }
    })
    .formatText()
}
