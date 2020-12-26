import * as ts from 'ts-morph'
import * as vue_class from './vue_class'
import * as imports from './imports'

type PostprocessCallback = (source: ts.SourceFile) => void

function writeDocs(
  writer: ts.CodeBlockWriter,
  docs: ts.JSDoc[],
) {
  for (const doc of docs) {
    writer.writeLine('/**')

    for (const line of doc.getInnerText().split('\n')) {
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
  for (const property of decorator.properties) {
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
      .writeLine('},')
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
    .writeLine('},')

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
      .writeLine('},')
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
          writeComputedGetter(writer, getter)

        } else {
          writeComputedProperty(writer, name, getter, setter)
        }
      }
    }
      
    writer.writeLine('},')
  }
}

function writeComputedProperty(
  writer: ts.CodeBlockWriter,
  name: string,
  getter: ts.GetAccessorDeclaration,
  setter: ts.SetAccessorDeclaration
) {
  writer
    .write(name)
    .write(':')
    .space()
    .write('{')
    .newLine()
    .withIndentationLevel(1, () => {
      const setParameter = setter.getParameters()[0]

      if (!setParameter) {
        throw new Error('Computed setter doesn\'t seem to have a parameter.')
      }

      writeDocs(writer, getter.getJsDocs())
      writer
        .write(`get()`)
        .write(':')
        .space()
        // Computed property getters need to match the setter's return type,
        // But there's actually a variety of places this can be obtained...
        // try them all before giving up with `any`.
        .write(getter.getReturnTypeNode()?.getText() 
            || setParameter.getTypeNode()?.getText() 
            || 'any')
        .newLine()
        .write(getter.getBodyOrThrow().getText())
        .write(',')
        .newLine()

      writeDocs(writer, setter.getJsDocs())
      writer
        .write('set(')
        .write(setParameter.getText())
        .write(')')
        .newLine()
        .write(setter.getBodyOrThrow().getText())
        .write(',')
        .newLine()
    })
    .writeLine('},')
  }

function writeComputedGetter(
  writer: ts.CodeBlockWriter,
  getter: ts.GetAccessorDeclaration
) {
  writeDocs(writer, getter.getJsDocs())
  writer
    .write(`${getter.getName()}():`)
    .space()
    .write(getter.getReturnTypeNode()?.getText() || 'any')
    .newLine()
    .write(getter.getBodyOrThrow().getText())
    .write(',')
    .newLine()
}

function writeMethods(
  writer: ts.CodeBlockWriter,
  methods: ts.MethodDeclaration[]
) {
  if (methods.length > 0) {
    writer
      .write('methods:')
      .space()
      .write('{')
      .newLine()
      .withIndentationLevel(1, () => {
        for (const method of methods) {
          writeMethod(writer, method)
        }
      })
      .writeLine('},')
  }
}

function writeMethod(
  writer: ts.CodeBlockWriter,
  method: ts.MethodDeclaration
) {
  writeDocs(writer, method.getJsDocs())
  writer
    .newLineIfLastNot()
    .write(method.getText())
    .write(',')
}

function writeWatches(
  writer: ts.CodeBlockWriter,
  watches: {
    path: string,
    declaration: ts.MethodDeclaration
    immediate?: ts.PropertyAssignment
    deep?: ts.PropertyAssignment
  }[]
) {
  if (watches.length > 0) {
    writer
      .write('watch:')
      .space()
      .write('{')
      .newLine()
      .withIndentationLevel(1, () => {
        for (const watch of watches) {
          writeWatch(writer, watch)
        }
      })
      .writeLine('},')
  }
}

function writeWatch(
  writer: ts.CodeBlockWriter,
  watch: {
    path: string,
    declaration: ts.MethodDeclaration,
    immediate?: ts.PropertyAssignment,
    deep?: ts.PropertyAssignment,
  }
) {
  writeDocs(writer, watch.declaration.getJsDocs())
  writer
    .write(watch.declaration.getName())
    .write(':')
    .space()
    .write('{')
    .newLine()
    .withIndentationLevel(1, () => {
      writer
        .write('path:')
        .space()
        .quote()
        .write(watch.path)
        .quote()
        .write(',')
        .newLine()

      if (watch.immediate) {
        writer
          .write(watch.immediate.getText())
          .write(',')
          .newLine()
      }

      if (watch.deep) {
        writer
          .write(watch.deep.getText())
          .write(',')
          .newLine()
      }

      writer
        .write(watch.declaration
          .getModifiers()
          .map(modifier => modifier.getText())
          .join(' ')
        )
        .conditionalWrite(!writer.isLastSpace(), ' ')
        .write('handler')
        .write('(')
        .write(watch.declaration
          .getParameters()
          .map(parameter => parameter.getText())
          .join(', ')
        )
        .write(')')
        .space()
        .withIndentationLevel(1, () => {
          writer.write(watch.declaration.getBodyOrThrow().getText())
        })
        .write(',')
        .newLine()
    })
    .writeLine('},')
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
    watches,
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
          writeMethods(writer, methods)
          writeWatches(writer, watches)
        })
        .write('})')
    },
    isExportEquals: false,
  })

  // Perform any processing that had to happen after we finished writing.
  for (const callback of callbacks.reverse()) {
    callback(source)
  }

  // Remove the class now that we're done reading everything.
  vue.declaration.remove()
}
