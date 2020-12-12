import test, { ExecutionContext } from 'ava'
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph'

import { declassify } from './index'

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  skipLoadingLibFiles: true,
  manipulationSettings: {
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    newLineKind: NewLineKind.LineFeed,
    quoteKind: QuoteKind.Single,
    useTrailingCommas: false,
    indentationText: IndentationText.TwoSpaces,
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

test('fails when the source is missing a default export', t => {
  const source = `
import { Component, Vue } from 'vue-property-decorator';
  `

  t.throws(() => validate(t, source, ''))
})

test('rewrites an empty class-based component to an empty object component', t => {
  const source = `
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Empty extends Vue {

}
  `

  const truth = `
import Vue from 'vue';

export default Vue.extend({
  name: 'Empty'
});
  `

  validate(t, source, truth)
})
