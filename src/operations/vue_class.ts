import {
  ClassDeclaration,
  Decorator,
  GetAccessorDeclaration,
  MethodDeclaration,
  Node,
  NodeParentType,
  ObjectLiteralExpression,
  PropertyAssignment,
  PropertyDeclaration,
  SetAccessorDeclaration,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  ts
} from 'ts-morph'

function unpackComponentDecorator(decorator: Decorator) {
  const decoratorArguments = decorator.getArguments()

  if (decoratorArguments.length > 0) {
    const initialDecoratorArgument = decoratorArguments[0]

    if (!(initialDecoratorArgument instanceof ObjectLiteralExpression)) {
      throw new Error('The first argument to @Component is not an object literal.')
    }

    return {
      properties: initialDecoratorArgument.getProperties(),
    }
  }

  return {
    properties: [],
  }
}

function unpackPropDecorator(decorator: Decorator, argumentIndex = 0) {
  const configuration: {
    required?: PropertyAssignment
    default?: PropertyAssignment
  } = {}

  const decoratorArguments = decorator.getArguments()

  if (decoratorArguments.length > 0) {
    const propOptionsArgument = decoratorArguments[argumentIndex]

    if (!(propOptionsArgument instanceof ObjectLiteralExpression)) {
      throw new Error('The first argument to @Prop is not an object literal.')
    }

    const requiredProperty = propOptionsArgument.getProperty('required')

    if (requiredProperty) {
      if (!(requiredProperty instanceof PropertyAssignment)) {
        throw new Error('The `required` value to @Prop is not a property assignment.')
      }

      configuration.required = requiredProperty
    }

    const defaultProperty = propOptionsArgument.getProperty('default')

    if (defaultProperty) {
      if (!(defaultProperty instanceof PropertyAssignment)) {
        throw new Error('The `default` value to @Prop is not a property assignment.')
      }

      configuration.default = defaultProperty
    }
  }

  return configuration
}

function unpackPropSyncDecorator(decorator: Decorator) {
  const decoratorArguments = decorator.getArguments()

  if (decoratorArguments.length === 0) {
    throw new Error('@PropSync does not have at least its first argument.')
  }

  const syncPathArgument = decoratorArguments[0]

  if (!(syncPathArgument instanceof StringLiteral)) {
    throw new Error('The first argument to @PropSync is not a string literal.')
  }

  return {
    sync: syncPathArgument.getLiteralValue(),
    ...unpackPropDecorator(decorator, 1),
  }
}

function unpackWatchDecorator(decorator: Decorator) {
  const decoratorArguments = decorator.getArguments()

  if (decoratorArguments.length === 0) {
    throw new Error('@Watch does not at least its first argument.')
  }

  const watchPathArgument = decoratorArguments[0]

  if (!(watchPathArgument instanceof StringLiteral)) {
    throw new Error('The first argument to @Watch is not a string literal.')
  }

  const configuration: {
    path: string
    deep?: string
    immediate?: string
  } = {
    path: watchPathArgument.getLiteralValue(),
  }

  if (decoratorArguments.length > 1) {
    const watchOptionsArgument = decoratorArguments[1]

    if (!(watchOptionsArgument instanceof ObjectLiteralExpression)) {
      throw new Error('The second argument to @Watch is not an object literal.')
    }

    const deepProperty = watchOptionsArgument.getProperty('deep')

    if (deepProperty) {
      if (!(deepProperty instanceof PropertyAssignment)) {
        throw new Error('The `deep` property to @Watch is not a property assignment.')
      }

      configuration.deep = deepProperty.getText()
    }

    const immediateProperty = watchOptionsArgument.getProperty('immediate')

    if (immediateProperty) {
      if (!(immediateProperty instanceof PropertyAssignment)) {
        throw new Error('The `immediate` property to @Watch is not a property assignment.')
      }

      configuration.immediate = immediateProperty.getText()
    }
  }

  return configuration
}

// Immediately rewrites @Emit by appending it to the end of its function.
function rewriteEmitDecorator(method: MethodDeclaration, decorator: Decorator) {
  const [nameLiteral] = decorator.getArguments()

  // The name for @Emit is either the decorator's first argument, or defaults to the method name.
  let eventName: string

  if (nameLiteral) {
    if (!(nameLiteral instanceof StringLiteral)) {
      throw new Error('The first argument to @Emit must be a string literal.')
    }

    eventName = nameLiteral.getLiteralValue()
  } else {
    eventName = method.getName()
  }

  // Determine which return statements are top-level by iteratively looking at their parent nodes.
  const toplevelReturns = method
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter(statement => {
      let parent: NodeParentType<ts.Node> = statement.getParent()

      while (parent) {
        if (Node.isScopedNode(parent)) {
          // The definition of top-level: the closest scoped parent node is the decorated method.
          return parent === method
        }

        parent = parent.getParent()
      }

      return false
    })

  if (toplevelReturns.length > 0) {
    method.setIsAsync(true)

    for (const statement of toplevelReturns) {
      if (statement.wasForgotten()) {
        continue
      }

      const expression = statement.getExpressionOrThrow()
      statement.replaceWithText(`this.$emit('${eventName}', await ${expression.getText()})\nreturn`)
    }

    return
  }

  const parameters = method
    .getParameters()
    .map(parameter => parameter.getName())
    .join(', ')

  if (parameters) {
    method.setBodyText(`${method.getBodyText()}\nthis.$emit('${eventName}', ${parameters})`)
  } else {
    method.setBodyText(`${method.getBodyText()}\nthis.$emit('${eventName}')`)
  }
}

// Unpacks a Vue class declaration into its Vue properties.
function unpackClass(declaration: ClassDeclaration) {
  const props: {
    declaration: PropertyDeclaration
    default?: PropertyAssignment
    required?: PropertyAssignment
  }[] = []

  const syncProps: {
    declaration: PropertyDeclaration
    sync: string
    default?: PropertyAssignment
    required?: PropertyAssignment
  }[] = []

  const data: PropertyDeclaration[] = []
  const methods: MethodDeclaration[] = []
  
  const computed: Record<string, {
    getter?: GetAccessorDeclaration
    setter?: SetAccessorDeclaration
  }> = {}

  const watches: {
    path: string
    method: string
    immediate?: string
    deep?: string
  }[] = []

  for (const property of declaration.getInstanceProperties()) {
    if (property instanceof PropertyDeclaration) {
      {
        const decorator = property.getDecorator('Prop')
        
        if (decorator) {
          props.push({
            declaration: property,
            ...unpackPropDecorator(decorator),
          })
  
          continue // Processed it, so continue.
        }
      }

      {
        const decorator = property.getDecorator('PropSync')

        if (decorator) {
          syncProps.push({
            declaration: property,
            ...unpackPropSyncDecorator(decorator),
          })
          
          continue // Processed it, so continue.
        }
      }

      // Undecorated property, so it's plain old data.
      data.push(property)

    } else if (property instanceof GetAccessorDeclaration) {
      const name = property.getName()

      if (!(name in computed)) {
        computed[name] = {}
      }
      
      computed[name].getter = property

    } else if (property instanceof SetAccessorDeclaration) {
      const name = property.getName()

      if (!(name in computed)) {
        computed[name] = {}
      }

      computed[name].setter = property
      
    } else {
      throw new Error(`Unexpected instance member of type: ${property.getKindName()}.`)
    }
  }

  for (const method of declaration.getInstanceMethods()) {
    for (const decorator of method.getDecorators()) {
      if (decorator.getName() === 'Watch') {
        watches.push({
          method: method.getName(),
          ...unpackWatchDecorator(decorator),
        })
        
        decorator.remove()
      
      } else if (decorator.getName() === 'Emit') {
        rewriteEmitDecorator(method, decorator)
        decorator.remove()
      }
    }

    methods.push(method)
  }

  return {
    props,
    syncProps,
    data,
    computed,
    methods,
    watches,
  }
}

// Extracts all Vue properties from the Vue class in a source file.
// Mostly responsible for implementing the various decorators.
export function extract(source: SourceFile) {
  const defaultExport = source.getDefaultExportSymbol()

  if (!defaultExport) {
    return
  }

  const declaration = defaultExport.getValueDeclaration()

  if (!(declaration instanceof ClassDeclaration)) {
    return
  }

  const decorator = declaration.getDecorator('Component')

  if (!decorator) {
    return
  }

  return {
    declaration,
    ...unpackClass(declaration),
    decorator: {
      ...unpackComponentDecorator(decorator),
    }
  }
}
