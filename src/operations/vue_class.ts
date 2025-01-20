import { ClassDeclaration, Decorator, GetAccessorDeclaration, MethodDeclaration, ObjectLiteralExpression, PropertyAssignment, PropertyDeclaration, SetAccessorDeclaration, SourceFile, StringLiteral } from 'ts-morph'

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

  function handleEmitDecorator(decorator: Decorator, method: MethodDeclaration) {
    const decoratorArguments = decorator.getArguments()

    if (decoratorArguments.length === 0) {
      throw new Error('@Emit does not have at least its first argument.')
    }

    const emitNameLiteral = decoratorArguments[0]

    if (!(emitNameLiteral instanceof StringLiteral)) {
      throw new Error('The first argument to @Emit is not a string literal.')
    }

    const emitName = emitNameLiteral.getLiteralValue();
    let emitStatement = `this.$emit(\'${emitName}\');`;

    if (method.getBodyText() !== "") {
      emitStatement = '\n' + emitStatement;
    }

    method.setBodyText(method.getBodyText()  + emitStatement)
  }

  for (const method of declaration.getInstanceMethods()) {
    for (const decorator of method.getDecorators()) {
      if (decorator.getName() === 'Watch') {
        watches.push({
          method: method.getName(),
          ...unpackWatchDecorator(decorator),
        })
        
        decorator.remove()
      }

      else if(decorator.getName() === 'Emit') {
        handleEmitDecorator(decorator, method);
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
