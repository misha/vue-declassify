import { Project } from 'ts-morph'

import * as imports from './operations/imports'
import * as vue from './operations/vue_object'

export function declassify(project: Project, code: string, mode: 'ts' | 'vue'): string {
  switch (mode) {
    case 'vue':
      return declassifyVue(project, code)

    case 'ts':
      return declassifyTypeScript(project, code)
  }
}

function declassifyVue(project: Project, code: string) {
  const match = code.match(/<script[^>]*>\s*(?<code>.*)<\/script>/s)

  if (!match || !match.groups) {
    throw new Error('Vue file doesn\'t seem to have a valid <script> tag.')
  }

  const tsCode = match.groups['code']
  return code.replace(tsCode, declassifyTypeScript(project, tsCode))
}

function declassifyTypeScript(project: Project, code: string) {
  const source = project.createSourceFile('test.ts', code, {
    overwrite: true
  })
  
  imports.remove(source, 'vue-class-component', 'vue-property-decorator')
  imports.ensure(source, 'vue', { default: 'Vue' })
  vue.classToObject(source)
  return source.getFullText()
}
