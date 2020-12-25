import * as ts from 'ts-morph'
import * as vue_class from './vue_class'
import * as imports from './imports'

type PostprocessCallback = (source: ts.SourceFile) => void

// function classComputedGetterToObjectComputedGetter(
//   source: SourceFile,
//   name: string,
//   getter: GetAccessorDeclaration,
// ): ts.MethodDeclaration {
//   let getterReturnType: ts.TypeNode | undefined = undefined

//   if (getter.getReturnTypeNode()) {
//     getterReturnType = getter.getReturnTypeNodeOrThrow().compilerNode
  
//   } else {
//     getterReturnType = f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
//     console.log(`Computed getter 「${name}」 will require a manual return type.`)
//   }

//   return f.createMethodDeclaration(
//     undefined,
//     undefined,
//     undefined,
//     f.createIdentifier(name),
//     undefined,
//     undefined,
//     [],
//     getterReturnType,
//     transformBlock(getter.getBodyOrThrow() as Block, true),
//   )
// }

// function classComputedPropertyToObjectComputedProperty(
//   source: SourceFile,
//   name: string,
//   getter: GetAccessorDeclaration,
//   setter: SetAccessorDeclaration,
// ): ts.PropertyAssignment {
//   const setParameter = setter.getParameters()[0]

//   if (!setParameter) {
//     throw new Error('Computed setter doesn\'t seem to have a parameter.')
//   }

//   const setterDeclaration = f.createMethodDeclaration(
//     undefined,
//     undefined,
//     undefined,
//     f.createIdentifier('set'),
//     undefined,
//     undefined,
//     [setParameter.compilerNode],
//     undefined,
//     transformBlock(setter.getBodyOrThrow() as Block, true),
//   )

//   let getterReturnType: ts.TypeNode | undefined = undefined

//   // If there was a computed setter, Vue requires that the getter have
//   // an annotated return type of the same type argument as that setter's
//   // parameter. This is where we try to ensure that.
//   if (setParameter.getTypeNode()) {
//     getterReturnType = setParameter.getTypeNodeOrThrow().compilerNode

//   } else {
//     getterReturnType = f.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
//     console.log(`Computed getter for 「${name}」 will require a manual return type.`)
//   }

//   const getterDeclaration = f.createMethodDeclaration(
//     undefined,
//     undefined,
//     undefined,
//     f.createIdentifier('get'),
//     undefined,
//     undefined,
//     [],
//     getterReturnType,
//     transformBlock(getter.getBodyOrThrow() as Block),
//   )
      
//   return f.createPropertyAssignment(
//     f.createIdentifier(name),
//     f.createObjectLiteralExpression(
//       [
//         getterDeclaration,
//         setterDeclaration,
//       ], 
//       true,
//     ),
//   )
// }

// function classComputedToObjectComputed(
//   source: SourceFile,
//   vue: {
//     computed: Record<string, {
//       getter?: GetAccessorDeclaration
//       setter?: SetAccessorDeclaration
//     }>
//   }
// ): ts.PropertyAssignment {
//   const properties: ts.ObjectLiteralElementLike[] = []

//   for (let [name, { getter, setter }] of Object.entries(vue.computed)) {
//     if (getter) {
//       if (setter) {
//         properties.push(
//           classComputedPropertyToObjectComputedProperty(
//             source,
//             name, 
//             getter, 
//             setter,
//           ),
//         )

//       } else {
//         properties.push(
//           classComputedGetterToObjectComputedGetter(
//             source, 
//             name, 
//             getter,
//           ),
//         )
//       }

//     } else if (setter) {
//       throw new Error('Found an illegal computed setter without a getter.')
//     }
//   }

//   return f.createPropertyAssignment(
//     f.createIdentifier('computed'),
//     f.createObjectLiteralExpression(properties, true),
//   )
// }

// function classMethodsToObjectMethods(
//   source: SourceFile,
//   vue: {
//     methods: MethodDeclaration[]
//   }
// ): ts.PropertyAssignment {
//   return f.createPropertyAssignment(
//     f.createIdentifier('methods'),
//     f.createObjectLiteralExpression(
//       vue.methods.map(method => 
//         // I really, really want to just pass the compiler node... but no dice.
//         // The values simply do not render.
//         f.createMethodDeclaration(
//           method.getDecorators()?.map(toTS),
//           method.getModifiers()?.map(modifier => modifier.compilerNode as ts.Modifier),
//           undefined,
//           f.createIdentifier(method.getName()),
//           undefined,
//           method.getTypeParameters()?.map(toTS),
//           method.getParameters()?.map(toTS),
//           method.getReturnTypeNode()?.compilerNode,
//           transformBlock(method.getBodyOrThrow() as Block, true),
//         ),
//       ),
//       true,
//     ),
//   )
// }

function writeDocs(
  writer: ts.CodeBlockWriter,
  docs: ts.JSDoc[],
) {
  for (let doc of docs) {
    writer.writeLine('/**')

    for (let line of doc.getInnerText().split('\n')) {
      writer
        .write(' *')
        .conditionalWrite(!!line.trim(), ' ')
        .write(line)
        .newLine()
    }

    writer.writeLine(' */')
  }
}

function writeName(
  writer: ts.CodeBlockWriter,
  declaration: ts.ClassDeclaration,
) {
  writer
    .write('name:')
    .space()
    .quote()
      .write(declaration.getNameOrThrow())
    .quote()
    .write(',')
    .newLine()
}

function writeConfig(
  writer: ts.CodeBlockWriter,
  decorator: {
    properties: ts.ObjectLiteralElementLike[]
  }
) {
  for (let property of decorator.properties) {
    writer.write(property.getText())
  }
}

function writeProps(
  writer: ts.CodeBlockWriter, 
  props: {
    declaration: ts.PropertyDeclaration
    required?: ts.PropertyAssignment
    default?: ts.PropertyAssignment
  }[]
): PostprocessCallback[] {
  const callbacks: PostprocessCallback[] = []

  if (props.length > 0) {
    writer
      .write('props:')
      .space()
      .write('{')
      .newLine()
      .withIndentationLevel(1, () => {
        for (let prop of props) {
          callbacks.push(...writeProp(writer, prop))
        }
      })
      .write('}')
      .write(',')
      .newLine()
  }

  return callbacks
}

function writeProp(
  writer: ts.CodeBlockWriter,
  prop: {
    declaration: ts.PropertyDeclaration
    required?: ts.PropertyAssignment
    default?: ts.PropertyAssignment
  }
): PostprocessCallback[] {
  const callbacks: PostprocessCallback[] = []
  writeDocs(writer, prop.declaration.getJsDocs())

  writer
    .write(`${prop.declaration.getName()}:`)
    .space()
    .write('{')
    .withIndentationLevel(1, () => {
      callbacks.push(...writePropType(writer, prop.declaration))
      writePropOptions(writer, prop)
    })
    .write('}')
    .write(',')
    .newLine()

  return callbacks
}

function writePropType(
  writer: ts.CodeBlockWriter,
  declaration: ts.PropertyDeclaration
): PostprocessCallback[] {
  const callbacks: PostprocessCallback[] = []
  const type = declaration.getType()
  writer.write('type: ')

  if (type.isString()) {
    writer.write('String')
  
  } else if (type.isNumber()) {
    writer.write('Number')

  } else if (type.isBoolean()) {
    writer.write('Boolean')
  
  } else {
    const actualType = declaration.getTypeNodeOrThrow().getText()

    // Vue.js props can only be primitive types, unless you use PropType.
    // However, even when using PropType, the base annotated type must be
    // the same type as the annotated one, or you get type errors anyway.
    let baseType: 'Object' | 'Function' | 'Array'

    // HACK: Adjust Object/Function/Array based on what the type seems to be.
    // This heuristic can be improved drastically, and is part of what makes
    // a project like vue-declassify difficult. 
  
    if (type.getCallSignatures().length > 0) {

      // This one is actually pretty safe. TS will tell us if what's inside has
      // a call signature, making it a function.
      baseType = 'Function'

    } else if (actualType.startsWith('Array<') || actualType.endsWith('[]')) {

      // This is some nonsense calculation but, it's quite effective? Arrays
      // are easy to spot syntactically. This doesn't work for user-defined
      // array types though. Fortunately, those are exceedingly rare.
      baseType = 'Array'

    } else {
      baseType = 'Object'
    }

    writer.write(`${baseType} as PropType<${actualType}>`)

    // Add PropType to the imports afterwards, since we just used it.
    callbacks.push(source => {
      imports.ensure(source, 'vue', {
        named: ['PropType'],
      })
    })
  }

  writer
    .write(',')
    .newLine()

  return callbacks
}

function writePropOptions(
  writer: ts.CodeBlockWriter,
  options: {
    required?: ts.PropertyAssignment
    default?: ts.PropertyAssignment
  }
) {
    
  // Only permit exactly one of `default` and `required`,
  // since a default value implies required is false in Vue.
  // There actually doesn't seem to be a use-case to set both!
  if (options.default) {
    writer.write(options.default.getText())

  } else if (options.required) {
    writer.write(options.required.getText())

  } else {

    // Lastly, if neither property is directly supplied, mark `required` false.
    writer.write('required: false')
  }

  writer
    .write(',')
    .newLine()
}

function writeData(
  writer: ts.CodeBlockWriter,
  data: ts.PropertyDeclaration[]
) {
  if (data.length > 0) {
    writer
      .writeLine('data()')
      .space()
      .write('{')
      .newLine()
      .withIndentationLevel(1, () => {
        writer.writeLine('return {')

        for (const property of data) {
          writeDataProperty(writer, property)
        }

        writer.writeLine('};')
      })
      .write('}')
      .write(',')
      .newLine()
  }
}

function writeDataProperty(
  writer: ts.CodeBlockWriter,
  property: ts.PropertyDeclaration,
) {
  writeDocs(writer, property.getJsDocs())
  writer
    .write(property.getName())
    .write(':')
    .space()
    .write(property.getInitializerOrThrow().getText())

  const type = property.getTypeNode()

  if (type) {
    writer
      .space()
      .write('as')
      .space()
      .write(type.getText())
  }
          
  writer
    .write(',')
    .newLine()
}

function writeComputed(
  writer: ts.CodeBlockWriter,
  computed: Record<string, {
    getter?: ts.GetAccessorDeclaration
    setter?: ts.SetAccessorDeclaration
  }>
) {
  if (Object.keys(computed).length > 0) {
    writer
      .write('computed:')
      .space()
      .write('{')
      .newLine()
  
    for (const [name, { getter, setter }] of Object.entries(computed)) {
      if (getter) {
        if (!setter) {
          writeComputedGetter(writer, name, getter)

        } else {
          writeComputedProperty(writer, name, getter, setter)
        }
      }
    }
      
    writer
      .write('}')
      .write(',')
      .newLine()
  }
}

function writeComputedGetter(
  writer: ts.CodeBlockWriter,
  name: string,
  getter: ts.GetAccessorDeclaration,
) {
  writer
    .write(`${name}()`)
    .write(':')
    .space()

  const type = getter.getReturnTypeNode()

  if (type) {
    writer.write(type.getText())

  } else {
    writer.write('any')
  }

  writer
    .space()
    .write(getter.getBodyOrThrow().getText())
    .write(',')
    .newLine()
}

function writeComputedProperty(
  writer: ts.CodeBlockWriter,
  name: string,
  getter: ts.GetAccessorDeclaration,
  setter: ts.SetAccessorDeclaration
) {

}

export function classToObject(source: ts.SourceFile) {
  const vue = vue_class.extract(source)

  if (!vue) {
    return
  }

  const {
    declaration,
    decorator,
    props,
    data,
    computed,
    methods,
    syncProps,
    watch,
  } = vue

  const callbacks: PostprocessCallback[] = [
    source => source.formatText()
  ]

  source.addExportAssignment({
    leadingTrivia: writer => {
      writeDocs(writer, declaration.getJsDocs())
    },
    expression: writer => {
      writer
        .writeLine('Vue.extend({')
        .withIndentationLevel(1, () => {
          writeName(writer, declaration)
          writeConfig(writer, decorator)
          callbacks.push(...writeProps(writer, props))
          writeData(writer, data)
          writeComputed(writer, computed)
        })
        .write('})')
    },
    isExportEquals: false,
  })

  // Perform any processing that had to happen after we finished writing.
  for (let callback of callbacks.reverse()) {
    callback(source)
  }

  // Remove the class now that we're done reading everything.
  vue.declaration.remove()
}
