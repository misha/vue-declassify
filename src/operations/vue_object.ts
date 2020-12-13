import { ClassDeclaration, JSDoc, printNode, PropertyAssignment, PropertyDeclaration, SourceFile, SyntaxKind, ts } from 'ts-morph'

import * as vue_class from './vue_class'
import * as imports from './imports'

const f = ts.factory

function createDocumentation<T extends ts.Node>(target: T, docs: JSDoc[]) {
  
  // Unclear how to directly plop an entire, pre-rendered comment in front.
  // Forced to re-process the comment line-by-line to work with MultiLineCommentTriva.
  if (docs.length > 0) {
    const comment = docs[0].compilerNode.comment

    if (comment) {
      return ts.addSyntheticLeadingComment(
        target, 
        SyntaxKind.MultiLineCommentTrivia, 
        '*\n' + // Starts with '/*'
          comment
            .split('\n')
            .map(line => ` * ${line}`)
            .join('\n')
        + '\n ', // Ends with '*/' 
        true,
      )
    }
  }

  return target
}

function classNameToPropName(
  source: SourceFile,
  vue: {
    declaration: ClassDeclaration,
  }
): ts.PropertyAssignment {
  return f.createPropertyAssignment(
    f.createIdentifier('name'),
    f.createStringLiteral(vue.declaration.getNameOrThrow(), true),
  )
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
          prop.declaration.getTypeNodeOrThrow().compilerNode
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
        f.createIdentifier(prop.default.getInitializerOrThrow().getText()),
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

function classPropsToObjectProps(
  source: SourceFile,
  vue: {
    props: {
      declaration: PropertyDeclaration
      default?: PropertyAssignment
      required?: PropertyAssignment
    }[]
  }
): ts.PropertyAssignment {
  return f.createPropertyAssignment(
    f.createIdentifier('props'),
    f.createObjectLiteralExpression(
      vue.props.map(prop => classPropToObjectProp(source, prop)),
      true,
    ),
  )
}

function classDataToObjectData(
  source: SourceFile,
  vue: {
    data: PropertyDeclaration[],
  },
): ts.MethodDeclaration {
  const properties: ts.ObjectLiteralElementLike[] = []

  for (const declaration of vue.data) {
    const initializer = declaration.getInitializerOrThrow()

    // Ok, this is a bit of a hack. I'm unable to check if the
    // declaration's type is a union or not (ie. isUnion() always
    // returns false). But, Vue data is only ever union-ed with null
    // anyway, and moreover only as an initial condition, so if the
    // initializer is null... that's exactly when we need the union
    // type `as` clause to help Vue out.

    // For posterity, the union check that doesn't seem to work is:
    //  => declaration.getType().isUnion()
    //  <= false
    // If the above code worked for actual union types, this would clean up.
    
    properties.push(
      createDocumentation(
        f.createPropertyAssignment(
          declaration.getName(),
          // Here's the part that should really be declaration.getType().isUnion().
          initializer.getType().isNull() ?
            // Add an `as` cast to include the null type, however it was written.
            f.createAsExpression(
              f.createIdentifier(initializer.getText()),
              declaration.getTypeNodeOrThrow().compilerNode,
            ) :
            // Otherwise we can just include the original initialize as-is.
            f.createIdentifier(initializer.getText()),
        ),
        declaration.getJsDocs(),
      )
    )
  }
  
  return f.createMethodDeclaration(
    undefined,
    undefined,
    undefined,
    f.createIdentifier('data'),
    undefined,
    undefined,
    [],
    undefined,
    f.createBlock(
      [
        f.createReturnStatement(
          f.createObjectLiteralExpression(
            properties,
            true,
          )
        ),
      ],
      true,
    )
  )
}

export function classToObject(source: SourceFile) {
  const vue = vue_class.extract(source)

  if (!vue) {
    return
  }

  const properties: ts.ObjectLiteralElementLike[] = []
  properties.push(classNameToPropName(source, vue))

  // Add any properties we inherited from the @Component decorator.
  // Note: this doesn't merge any Vue data that occurs in the class declaration.
  properties.push(...vue.decorator.properties.map(property => property.compilerNode))

  if (vue.props.length > 0) {
    properties.push(classPropsToObjectProps(source, vue))
  }

  if (vue.data.length > 0) {
    properties.push(classDataToObjectData(source, vue))
  }

  // Wrap the properties up in a call to Vue.extend().
  const component = f.createCallExpression(
    f.createIdentifier('Vue.extend'),
    undefined,
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
  source.addExportAssignment({
    expression: printNode(component),
    isExportEquals: false,
    leadingTrivia: writer => {
      if (documentation) {
        writer.writeLine(documentation)
      }
    }
  })
    
  source.formatText()
}
