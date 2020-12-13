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
  context.is(result.trim(), truth.trim(), `
Truth
=====

${truth}

Result
======

${result}
  `.trim())
}

test('removes class-based component library imports', t => {
  const source = `
import { Component, Vue } from 'vue-class-component';
import { Component, Prop, Vue } from 'vue-property-decorator';
  `

  const truth = `
import Vue from 'vue';
  `

  validate(t, source, truth)
})

test('only adds the Vue import if necessary', t => {
  const source = `
import Vue from 'vue'
  `

  const truth = source
  validate(t, source, truth)
})

test('writes the class name as the component name', t => {
  const source = `
@Component
export default class Component extends Vue {

}
  `

  const truth = `
import Vue from 'vue';

export default Vue.extend({
  name: 'Component'
});
  `

  validate(t, source, truth)
})


test('passes along configuration from the @Component decorator', t => {
  const source = `
@Component({
  components: {
    OtherComponent,
  }
})
export default class Component extends Vue {

}
  `

  const truth = `
import Vue from 'vue';

export default Vue.extend({
  name: 'Component',
  components: {
    OtherComponent,
  }
});
  `

  validate(t, source, truth)
})

test('converts props with primitive types correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  @Prop()
  message?: string

  @Prop()
  count?: number

  @Prop()
  flag?: boolean
}
  `

  const truth = `
import Vue from 'vue';

export default Vue.extend({
  name: 'Component',
  props: {
    message: {
      type: String,
      required: false
    },
    count: {
      type: Number,
      required: false
    },
    flag: {
      type: Boolean,
      required: false
    }
  }
});
  `

  validate(t, source, truth)
})

test('converts prop options correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  @Prop()
  a?: boolean

  @Prop({ required: false })
  b?: boolean

  @Prop({ required: true })
  c!: boolean

  @Prop({ default: 'Hello, world!' })
  d!: boolean

  @Prop({ default: 'Hello, world!', required: true })
  e!: boolean
}
  `

  const truth = `
import Vue from 'vue';

export default Vue.extend({
  name: 'Component',
  props: {
    a: {
      type: Boolean,
      required: false
    },
    b: {
      type: Boolean,
      required: false
    },
    c: {
      type: Boolean,
      required: true
    },
    d: {
      type: Boolean,
      default: 'Hello, world!'
    },
    e: {
      type: Boolean,
      default: 'Hello, world!'
    }
  }
});
  `

  validate(t, source, truth)
})

test('converts props with non-primitive types correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  @Prop({ required: true })
  model!: Model

  @Prop({ required: true })
  items!: Item[]

  @Prop({ default: () => noop })
  callback!: () => Promise<void>
}
  `

  const truth = `
import Vue, { PropType } from 'vue';

export default Vue.extend({
  name: 'Component',
  props: {
    model: {
      type: (Object as PropType<Model>),
      required: true
    },
    items: {
      type: (Object as PropType<Item[]>),
      required: true
    },
    callback: {
      type: (Object as PropType<() => Promise<void>>),
      default: () => noop
    }
  }
});
  `

  validate(t, source, truth)
})
