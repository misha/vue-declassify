import * as ts from 'ts-morph'
import * as vue_class from './vue_class'
import * as imports from './imports'
import {DeclassifyComputed, DeclassifyProp, DeclassifyPropWithDeclaration, DeclassifyWatch} from "../declassify";

type PostprocessCallback = (source: ts.SourceFile) => void

const LIFECYCLE_HOOKS = Object.freeze([
  'beforeCreate',
  'created',
  'beforeMount',
  'mounted',
  'beforeUpdate',
  'updated',
  'beforeDestroy',
  'destroyed',
])

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
  if (decorator.properties.length > 0) {
    for (const property of decorator.properties) {
      writer.write(property.getText())
    }

    writer
      .write(',')
      .newLine()
  }
}

function writeProps(
  writer: ts.CodeBlockWriter,
  props: DeclassifyPropWithDeclaration[],
  vModel: DeclassifyPropWithDeclaration | null
): PostprocessCallback[] {
  const callbacks: PostprocessCallback[] = []

  if (props.length > 0 || vModel) {
    writer
      .write('props:')
      .space()
      .write('{')
      .newLine()
      .withIndentationLevel(1, () => {
        if (vModel) {
          callbacks.push(...writeProp(writer, vModel, true))
        }
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
  prop: DeclassifyPropWithDeclaration,
  isVModel: boolean = false
): PostprocessCallback[] {
  const callbacks: PostprocessCallback[] = []
  writeDocs(writer, prop.declaration.getJsDocs())

  const name: string = isVModel?'value':prop.declaration.getName();
  writer
    .write(`${name}:`)
    .space()
    .write('{')
    .withIndentationLevel(1, () => {
      callbacks.push(...writePropType(writer, prop.declaration))
      writePropOptions(writer, prop, isVModel)
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
  options: DeclassifyProp,
  isVModel: boolean = false
) {

  // Only permit exactly one of `default` and `required`,
  // since a default value implies required is false in Vue.
  // There actually doesn't seem to be a use-case to set both!
  if (options.default) {
    writer.write(options.default.getText())

  } else if (options.required) {
    writer.write(options.required.getText())

  } else {
    // Lastly, if neither property is directly supplied, mark `required` with default value.
    const defaultRequiredValue = isVModel?'true':'false';
    writer.write(`required: ${defaultRequiredValue}`)
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
  computed: DeclassifyComputed,
  vModel: DeclassifyPropWithDeclaration | null
) {
  if (Object.keys(computed).length > 0 || vModel) {
    writer
      .write('computed:')
      .space()
      .write('{')
      .newLine()

    if (vModel) {
      writeComputedPropertyForVModel(writer, vModel.declaration.getName(), vModel.declaration.getType().getText())
    }
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

function writeGetter(writer: ts.CodeBlockWriter, type: string, body: string ) {
  writer
    .write(`get()`)
    .write(':')
    .space()
    .write(type)
    .newLine()
    .write(body)
    .write(',')
    .newLine()
}

function writeSetter(writer: ts.CodeBlockWriter, paramName: string, body: string) {
  writer
    .write('set(')
    .write(paramName)
    .write(')')
    .newLine()
    .write(body)
    .write(',')
    .newLine()
}

function writeProperty(writer: ts.CodeBlockWriter, name: string, action: () => void) {
  writer
    .write(name)
    .write(':')
    .space()
    .write('{')
    .newLine()
    .withIndentationLevel(1, action)
    .writeLine('},')
}

function writeComputedPropertyForVModel(
  writer: ts.CodeBlockWriter,
  name: string,
  type: string
) {
  const action = () => {
    writeGetter(writer, type, `{
      return this.value;
    }`);
    writeSetter(writer, 'value', `{
      this.$emit('input', value);
    }`);
  };
  writeProperty(writer, name, action);
}

function writeComputedProperty(
  writer: ts.CodeBlockWriter,
  name: string,
  getter: ts.GetAccessorDeclaration,
  setter: ts.SetAccessorDeclaration
) {
  writeProperty(writer, name, () => {
    const setParameter = setter.getParameters()[0]

    if (!setParameter) {
      throw new Error('Computed setter doesn\'t seem to have a parameter.')
    }

    writeDocs(writer, getter.getJsDocs())
    // Computed property getters need to match the setter's return type,
    // But there's actually a variety of places this can be obtained...
    // try them all before giving up with `any`.
    writeGetter(writer, getter.getReturnTypeNode()?.getText()
      ?? setParameter.getTypeNode()?.getText()
      ?? 'any', getter.getBodyOrThrow().getText());

    writeDocs(writer, setter.getJsDocs())
    writeSetter(writer, setParameter.getText(), setter.getBodyOrThrow().getText());
  });
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
  const lifecycleMethods: ts.MethodDeclaration[] = []
  const normalMethods: ts.MethodDeclaration[] = []

  for (const method of methods) {
    if (LIFECYCLE_HOOKS.includes(method.getName())) {
      lifecycleMethods.push(method)

    } else {
      normalMethods.push(method)
    }
  }

  for (const method of lifecycleMethods) {
    writeMethod(writer, method)
  }

  if (normalMethods.length > 0) {
    writer
      .write('methods:')
      .space()
      .write('{')
      .newLine()
      .withIndentationLevel(1, () => {
        for (const method of normalMethods) {
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
    .write(method.getText())
    .write(',')
    .newLine()
}

function writeWatches(
  writer: ts.CodeBlockWriter,
  watches: DeclassifyWatch[]
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
  watch: DeclassifyWatch
) {
  writer
    .quote()
    .write(watch.path)
    .quote()
    .write(':')
    .space()
    .write('{')
    .newLine()
    .withIndentationLevel(1, () => {
      writer
        .write('// @ts-ignore')
        .newLine()
        .write('handler:')
        .space()
        .write(`'${watch.method}'`)
        .write(',')
        .newLine()
        
      if (watch.immediate) {
        writer
          .write(watch.immediate)
          .write(',')
          .newLine()
      }

      if (watch.deep) {
        writer
          .write(watch.deep)
          .write(',')
          .newLine()
      }
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
    vModel
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
          callbacks.push(...writeProps(writer, props, vModel))
          writeData(writer, data)
          writeComputed(writer, computed, vModel)
          writeWatches(writer, watches)
          writeMethods(writer, methods)
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
