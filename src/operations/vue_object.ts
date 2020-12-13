import _, { assign } from 'lodash'
import { PropertyAssignment, PropertyDeclaration, SourceFile, SyntaxKind, ts, Type, TypeNode } from 'ts-morph'

import * as vue_class from './vue_class'
import * as imports from './imports'

const f = ts.factory
const scratchpad = ts.createSourceFile('', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
const printer = ts.createPrinter()

function print(node: ts.Node, hint: ts.EmitHint = ts.EmitHint.Unspecified) {
  return printer.printNode(hint, node, scratchpad)
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

function classPropToObjectProp(
  source: SourceFile,
  prop: {
    declaration: PropertyDeclaration
    default?: PropertyAssignment
    required?: PropertyAssignment
  }
) {
  const assignment = f.createPropertyAssignment(
    f.createIdentifier(prop.declaration.getName()),
    f.createObjectLiteralExpression(
      [
        classPropTypeToObjectPropType(source, prop),
        // Only permit exactly one of `default` and `required`,
        // since a default value implies required is false in Vue.
        (prop.default && 
          // Note: I really want to just pass the compiler node, but
          // for some reason `default` is special and does not render.
          // Probably has to do with `default` being a TS keyword.
          f.createPropertyAssignment(
            f.createIdentifier('default'),
            f.createIdentifier(prop.default.getInitializer().getText()),
          )
        ) || 
        prop.required?.compilerNode ||
        // Lastly, if `required` is not directly supplied, mark it as false.
        // This is consistent with the vue-property-decorator defaults.
        f.createPropertyAssignment(
          f.createIdentifier('required'),
          f.createFalse(),
        )
      ],
      true,
    ),
  )

  const firstJsDoc = prop.declaration.getJsDocs()[0]

  if (firstJsDoc) {

    // Unclear how to directly plop an entire, pre-rendered comment in front.
    // Forced to re-process the comment line-by-line to work with MultiLineCommentTriva.
    ts.addSyntheticLeadingComment(
      assignment, 
      SyntaxKind.MultiLineCommentTrivia, 
      '*\n' + // Starts with '/*'
        firstJsDoc
          .getInnerText()
          .split('\n')
          .map(line => ` * ${line}`)
          .join('\n')
      + '\n ', // Ends with '*/' 
      true,
    )
  }

  return assignment
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

  // Remove the class now that we're done porting it to the statement.
  vue.declaration.remove()

  // Add the new default export statement, printing from the object AST.
  source
    .addExportAssignment({
      expression: print(component),
      isExportEquals: false,
    })
    .formatText()
}
