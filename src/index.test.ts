import test, { ExecutionContext } from 'ava'
import { NewLineKind, Project, QuoteKind } from 'ts-morph'

import { declassify } from './index'

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  skipLoadingLibFiles: true,
  manipulationSettings: {
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    newLineKind: NewLineKind.LineFeed,
    quoteKind: QuoteKind.Single,
  },
  useInMemoryFileSystem: true,
})

function validate<T>(context: ExecutionContext<T>, source: string, truth: string) {
  const file = project.createSourceFile('test.ts', source.trim(), {
    overwrite: true
  })

  declassify(file)
  const result = file.getFullText()
  context.is(result.trim(), truth.trim())
}

test('rewrites class-component library imports to a single Vue import', t => {
  const source = `
    import { Component, Vue } from 'vue-property-decorator';
    import Vue, { Component } from 'vue-class-component';
  `

  const truth = `
    import Vue from 'vue';
  `

  validate(t, source, truth)
})
