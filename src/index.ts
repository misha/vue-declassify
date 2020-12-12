import { SourceFile } from 'ts-morph'
import { removeImport, ensureImport } from './operations/imports'

export function declassify(source: SourceFile) {
  removeImport(source, 'vue-class-component')
  removeImport(source, 'vue-property-decorator')
  ensureImport(source, 'vue', { default: 'Vue' })
}
