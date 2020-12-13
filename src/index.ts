import { SourceFile } from 'ts-morph'

import * as imports from './operations/imports'
import * as vue from './operations/vue_object'

export function declassify(source: SourceFile) {
  imports.remove(source, 'vue-class-component', 'vue-property-decorator')
  imports.ensure(source, 'vue', { default: 'Vue' })
  vue.classToObject(source)
}
