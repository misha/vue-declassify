# Vue Declassify

This project contains a script that converts class-style TypeScript Vue components into their equivalent object-style component.

## Usage

```
npm install -g vue-declassify
vue-declassify -h
```

Then, use `vue-declassify [file]` to convert individual files.

I highly recommend running your linter with auto-fix functionality afterwards, although all attempts were made to include reasonable formatting during transformation. I may add command line options to automatically perform some code style changes later on.

## Progress

Here's the plan for the project:

- [x] TypeScript components (*.ts files)
- [x] Vue SFC components (*.vue files)
- [x] Imports
- [x] `data`, in general
- [x] `methods`, in general
- [x] `get` Computed
- [x] `get`/`set` Computed
- [x] `@Component`
- [x] `@Prop`
- [x] `@Watch`
- [x] `@Emit` (contributed by [@mfillon](https://github.com/mfillon), [@LeVoMihalcea](https://github.com/LeVoMihalcea))
- [ ] `@PropSync`
- [x] JSDocs for all of the above

I'm not currently planning to support `@Inject`, `@Provide`, `@InjectReactive`, and `@ProvideReactive`. Although, if you do need them, make an issue and I'll implement it.

## Quirks

Here are some gotchyas for programmers going from class-based components to object-based components.

### Non-Primitive Prop Types

Vue prop types must be primitives, ie. `Boolean`, `Object`, etc. In the case that your prop type is not a primitive, though, Vue offers an additional `PropType` tool to communicate that type. `vue-declassify` makes every effort to generate this correctly, but it's not perfect.

For example, if you have a custom type `Model`, the entire prop type field would be transformed as `Object as PropType<Model>`. In the case of array- or function-types, the base type must be `Array` and `Function`, respectively. For everything else, `Object` seems to fly.

### Computed Return Types

Unlike class-based components, object-based component computed getters require a return type. In the case that `vue-declassify` is unable to find one, a line will logged letting you know which method requires a manual return type; in the meantime, an `any` will be inserted to allow your component to function as before.

Note that if you do not supply a return type for any one computed getter, your entire component fails to compile. Watch out!

## Motivation

I originally started writing Vue using libraries like `vue-class-component` and `vue-property-decorator` for a few reasons. I thought the class-based writing style was easier to read, and other engineers would find it more familiar. 

Unfortunately, class-style components have several drawbacks.

1. Vetur's experimental template type checking feature only works if the the types are available to Vue. Class-based components do not make those types available, so you would have to define property types twice. This is a core feature of the framework and I don't want to have to dance around it *every time I write a component*.

2. Even when defined as classes, components do not behave like nor can they be treated as classes. You cannot extend a component because, while the operation is well-defined for classes, extending `<template>` or `<style>` tags is inherently undefined. This is confusing. Similarly, class-based components can have type parameters, but real component cannot - and it's better not to write them as such.

3. It's an extra layer of indirection. When new engineers are on-boarded, they have learn that the "class" they're writing goes through *several* transformations: class-based Vue, object-based Vue, split by tags, and then finally TypeScript to JavaScript, etc. When introducing Vue, I've found removing that layer to be drastically simpler because people make fewer assumptions about how it works, and RTFM instead.

So, you can use `vue-declassify` to "de-class-ify" your TypeScript Vue components and simplify your code base while gaining additional type safety.
