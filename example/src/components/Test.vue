<template>
  <div />
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

import OtherTest from './OtherTest.vue'

/**
 * This component's description.
 */
@Component({
  components: {
    OtherTest,
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
}
</script>
