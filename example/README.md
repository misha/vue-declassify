# Example

This is a demo for `vue-declassify`. It contains an example class-based component that obtains stronger type safety by transforming back to object-based component syntax.

To run the example, first build the project in the root directory:

```
$ npm run build
```

Then, use `cli.js` to rewrite `Test.vue`:

```
$ node dist/cli.js example/src/components/Test.vue
Successfully declassified example/src/components/Test.vue!
```

And look at the resulting, equivalent component.
