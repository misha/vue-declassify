<template>
  <div />
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

import TestHelper from './TestHelper.vue'

/**
 * This component's description.
 */
@Component({
  components: {
    TestHelper,
  },
})
export default class Test extends Vue {

  /**
   * This component's title.
   */
  @Prop({ required: true })
  title!: string

  /**
   * This component's count.
   */
  @Prop({ default: 5 })
  count!: number

  /**
   * Some messages to show the user.
   */
  internalMessages: string[] = []

  get offsetCount() {
    return this.count + 1
  }

  set offsetCount(value: number) {
    this.$emit('count', value - 1)
  }

  get initialMessage(): string | undefined {
    return this.internalMessages[0]
  }
}
</script>
