import test from 'ava'

import { declassify } from './index'

test('can declassify an empty component', t => {
  const source = `
    import { Component, Vue } from 'vue-property-decorator'
  
    @Component()
    export default class MyComponent extends Vue {
      
    }
  `.trim()

  const expected = `
    import Vue from 'vue'

    export default Vue.extend({})
  `.trim()

  t.deepEqual(declassify(source), expected)
})
