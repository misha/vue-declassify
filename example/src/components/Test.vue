<template>
  <div />
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

/**
 * This component's description.
 */
@Component
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
}
</script>
