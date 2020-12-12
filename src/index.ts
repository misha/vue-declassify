import { ClassDeclaration, NewLineKind, SourceFile, SyntaxKind, Node, ts } from 'ts-morph'

import * as imports from './operations/imports'
import * as vue from './operations/vue'

export function declassify(source: SourceFile) {
  imports.remove(source, 'vue-class-component', 'vue-property-decorator')
  imports.ensure(source, 'vue', { default: 'Vue' })
  vue.classToObject(source)
}
