import test, { ExecutionContext } from 'ava'
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph'

import { declassify } from './index'

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
  skipLoadingLibFiles: true,
  useInMemoryFileSystem: true,
  manipulationSettings: {
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    newLineKind: NewLineKind.LineFeed,
    quoteKind: QuoteKind.Single,
    useTrailingCommas: false,
    indentationText: IndentationText.TwoSpaces,
  },
})

function validate<T>(
  context: ExecutionContext<T>,
  source: string,
  truth: string,
  mode: 'ts' | 'vue' = 'ts',
) {

  const result = declassify(project, source.trim(), mode)
  context.is(result.trim(), truth.trim(), `
Truth
=====

${truth}

Result
======

${result}
  `)
}

test('can also handle Vue SFC code', t => {
  const source = `
<template>
  <div />
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class SFCComponent extends Vue {
  
}
</script>

<style>
div {
  padding: 2px;
}
</style>
  `

  const truth = `
<template>
  <div />
</template>

<script lang="ts">
import Vue from 'vue';
export default Vue.extend({
  name: 'SFCComponent',
});
</script>

<style>
div {
  padding: 2px;
}
</style>
  `

  validate(t, source, truth, 'vue')
})

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
  name: 'Component',
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
  },
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
      required: false,
    },
    count: {
      type: Number,
      required: false,
    },
    flag: {
      type: Boolean,
      required: false,
    },
  },
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
      required: false,
    },
    b: {
      type: Boolean,
      required: false,
    },
    c: {
      type: Boolean,
      required: true,
    },
    d: {
      type: Boolean,
      default: 'Hello, world!',
    },
    e: {
      type: Boolean,
      default: 'Hello, world!',
    },
  },
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

  @Prop({ required: true })
  data!: {
    callback: () => Promise<void>
    flag: boolean
    value: number
  }
}
  `

  const truth = `
import Vue, { PropType } from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    model: {
      type: Object as PropType<Model>,
      required: true,
    },
    items: {
      type: Array as PropType<Item[]>,
      required: true,
    },
    callback: {
      type: Function as PropType<() => Promise<void>>,
      default: () => noop,
    },
    data: {
      type: Object as PropType<{
        callback: () => Promise<void>
        flag: boolean
        value: number
      }>,
      required: true,
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts components with comments correctly', t => {
  const source = `
/**
 * This is my component!
 */
@Component
export default class Component extends Vue {

}
  `

  const truth = `
import Vue from 'vue';
/**
 * This is my component!
 */
export default Vue.extend({
  name: 'Component',
});
  `

  validate(t, source, truth)
})

test('converts props with comments correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  /**
   * Some sort of flag.
   * 
   * Note: This is a note.
   */
  @Prop({ required: false })
  flag?: boolean
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    /**
     * Some sort of flag.
     *
     * Note: This is a note.
     */
    flag: {
      type: Boolean,
      required: false,
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts simple data correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  x = 5
  y: string = 'test'
  z = 6
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  data() {
    return {
      x: 5,
      y: 'test' as string,
      z: 6,
    };
  },
});
  `

  validate(t, source, truth)
})

test('converts union-typed data correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  x: string | null = null
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  data() {
    return {
      x: null as string | null,
    };
  },
});
  `

  validate(t, source, truth)
})

test('converts data comments correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  /**
   * This is like, some super important property.
   */
  x = 10

  /**
   * Here's another one!
   * 
   * Hope you read it all...
   */
  y = 'test'
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  data() {
    return {
      /**
       * This is like, some super important property.
       */
      x: 10,
      /**
       * Here's another one!
       *
       * Hope you read it all...
       */
      y: 'test',
    };
  },
});
  `

  validate(t, source, truth)
})

test('converts computed getters correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  @Prop({ required: true })
  model!: Model

  get modelFlag() {
    return this.model.flag
  }

  get annotatedModelFlag(): boolean {
    return this.model.flag
  }
}
  `

  const truth = `
import Vue, { PropType } from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    model: {
      type: Object as PropType<Model>,
      required: true,
    },
  },
  computed: {
    modelFlag(): any {
      return this.model.flag
    },
    annotatedModelFlag(): boolean {
      return this.model.flag
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts computed properties correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  count = 0

  get offsetCount() {
    return this.count + 1
  }

  set offsetCount(value: number) {
    this.count = value - 1
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  data() {
    return {
      count: 0,
    };
  },
  computed: {
    offsetCount: {
      get(): number {
        return this.count + 1
      },
      set(value: number) {
        this.count = value - 1
      },
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts methods correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  onClick() {
    console.log('Hello, world!')
  }

  async compute(): boolean {
    return await sendCompute()
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    onClick() {
      console.log('Hello, world!')
    },
    async compute(): boolean {
      return await sendCompute()
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts watch correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Prop({ required: true })
  loading!: boolean

  @Watch('loading')
  executeAnimationOnLoading(current: boolean, previous: boolean) {
    if (current && !previous) {
      console.log('Animating now!')
    }
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    loading: {
      type: Boolean,
      required: true,
    },
  },
  watch: {
    'loading': {
      // @ts-ignore
      handler: 'executeAnimationOnLoading',
    },
  },
  methods: {
    executeAnimationOnLoading(current: boolean, previous: boolean) {
      if (current && !previous) {
        console.log('Animating now!')
      }
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts multiple watches correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Prop({ required: true })
  enabled!: boolean

  clicks = 0

  @Watch('enabled')
  @Watch('clicks')
  logOnStatusChanged() {
    console.log('Enabled: ' + this.enabled)
    console.log('Clicks: ' + this.clicks)
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    enabled: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      clicks: 0,
    };
  },
  watch: {
    'enabled': {
      // @ts-ignore
      handler: 'logOnStatusChanged',
    },
    'clicks': {
      // @ts-ignore
      handler: 'logOnStatusChanged',
    },
  },
  methods: {
    logOnStatusChanged() {
      console.log('Enabled: ' + this.enabled)
      console.log('Clicks: ' + this.clicks)
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts watch comments correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Prop({ required: true })
  loading!: boolean

  /**
   * Log something when loading.
   */
  @Watch('loading')
  logOnLoading() {
    if (this.loading) {
      console.log('now loading')
    }
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    loading: {
      type: Boolean,
      required: true,
    },
  },
  watch: {
    'loading': {
      // @ts-ignore
      handler: 'logOnLoading',
    },
  },
  methods: {
    /**
     * Log something when loading.
     */
    logOnLoading() {
      if (this.loading) {
        console.log('now loading')
      }
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts watch options correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Prop({ required: true })
  loading!: boolean

  /**
   * Log something when loading.
   */
  @Watch('loading', { immediate: true, deep: false })
  logOnLoading() {
    if (this.loading) {
      console.log('now loading')
    }
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    loading: {
      type: Boolean,
      required: true,
    },
  },
  watch: {
    'loading': {
      // @ts-ignore
      handler: 'logOnLoading',
      immediate: true,
      deep: false,
    },
  },
  methods: {
    /**
     * Log something when loading.
     */
    logOnLoading() {
      if (this.loading) {
        console.log('now loading')
      }
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts lifecycle methods correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  created() {
    console.log('Hello, world!')
  }

  destroyed() {
    console.log('Goodbye, world.')
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  created() {
    console.log('Hello, world!')
  },
  destroyed() {
    console.log('Goodbye, world.')
  },
});
  `

  validate(t, source, truth)
})

test('converts unnamed emits correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit()
  onGreet() {
    console.log('Hello, world!')
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    onGreet() {
      console.log('Hello, world!')
      this.$emit('on-greet')
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts named emits correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit('greet')
  onGreet() {
    console.log('Hello, world!')
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    onGreet() {
      console.log('Hello, world!')
      this.$emit('greet')
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts emits on functions with arguments correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit('greet')
  onGreet(name: string) {
    console.log(\`Hello, \${name}!\`)
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    onGreet(name: string) {
      console.log(\`Hello, \${name}!\`)
      this.$emit('greet', name)
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts multiple emits correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit()
  @Emit('greet')
  onGreet(name: string) {
    console.log(\`Hello, \${name}!\`)
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    onGreet(name: string) {
      console.log(\`Hello, \${name}!\`)
      this.$emit('on-greet', name)
      this.$emit('greet', name)
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts emits with return statements correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit('greet')
  onGreet(name: string) {
    console.log(\`Hello, \${name}!\`)

    if (!name) {
      return "Hello, you!"
    }

    return \`Hello, \${name}!\`
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    async onGreet(name: string) {
      console.log(\`Hello, \${name}!\`)

      if (!name) {
        this.$emit('greet', await "Hello, you!")
        return
      }

      this.$emit('greet', await \`Hello, \${name}!\`)
      return
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts emits with nested return statements correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit('greet')
  onGreet(name: string) {
    console.log(\`Hello, \${name}!\`)

    if (!name) {
      return () => {
        return "Hello, you!"
      }
    }

    return \`Hello, \${name}!\`
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    async onGreet(name: string) {
      console.log(\`Hello, \${name}!\`)

      if (!name) {
        this.$emit('greet', await () => {
          return "Hello, you!"
        })
        return
      }

      this.$emit('greet', await \`Hello, \${name}!\`)
      return
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts emits on asynchronous functions with return statements correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @Emit('greet')
  async onGreet() {
    return await Promise.resolve('hello')
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  methods: {
    async onGreet() {
      this.$emit('greet', await await Promise.resolve('hello'))
      return
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts v-model correctly', t => {
  const source = `
@Component
export default class Component extends Vue {

  @VModel()
  message!: string
}
    `
  
    const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  computed: {
    message: {
      get() {
        return this.value
      },
      set(value) {
        this.$emit('input', value)
      },
    },
  },
});
  `

  validate(t, source, truth)
})

test('converts a mix of v-model and methods correctly', t => {
  const source = `
@Component
export default class Component extends Vue {
  
  @VModel()
  message!: string

  setMessage() {
    this.message = 'set'
  }

  loggingMessage() {
    console.log('loggingMessage', this.message)
  }
}
  `

  const truth = `
import Vue from 'vue';
export default Vue.extend({
  name: 'Component',
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  computed: {
    message: {
      get() {
        return this.value
      },
      set(value) {
        this.$emit('input', value)
      },
    },
  },
  methods: {
    setMessage() {
      this.message = 'set'
    },
    loggingMessage() {
      console.log('loggingMessage', this.message)
    },
  },
});
  `

  validate(t, source, truth)
})