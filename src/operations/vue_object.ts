import _ from 'lodash'
import { PropertyAssignment, SourceFile, ts, Type } from 'ts-morph'

import * as vue_class from './vue_class'

const f = ts.factory
const scratchpad = ts.createSourceFile('', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
const printer = ts.createPrinter()

function print(node: ts.Node, hint: ts.EmitHint = ts.EmitHint.Unspecified) {
  return printer.printNode(hint, node, scratchpad)
}

function classPropTypeToObjectPropType(type: Type): ts.PropertyAssignment {
  let initializer: ts.Expression

  if (type.isString()) {
    initializer = f.createIdentifier('String')

  } else if (type.isNumber()) {
    initializer = f.createIdentifier('Number')
  
  } else if (type.isBoolean()) {
    initializer = f.createIdentifier('Boolean')
  }

  if (!initializer) {
    throw new Error(`Failed to write a PropType for type: ${type}`)
  }

  return f.createPropertyAssignment(
    f.createIdentifier('type'),
    initializer,
  )
}

function classPropToObjectProp(prop: {
  name: string
  type: Type
  default?: PropertyAssignment
  required?: PropertyAssignment
}) {
  return f.createPropertyAssignment(
    f.createIdentifier(prop.name),
    f.createObjectLiteralExpression(
      [
        classPropTypeToObjectPropType(prop.type),
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
          vue.props.map(classPropToObjectProp),
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
