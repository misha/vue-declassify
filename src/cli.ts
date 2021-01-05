#!/usr/bin/env node

import fs from 'fs'
import program from 'commander'
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph'
import { declassify } from './index'

program
  .name('vue-declassify')
  .version('1.0.0')
  .command('declassify <component>', {
    isDefault: true,
  })
  .description('rewrites the TypeScript Vue component to object-based syntax', {
    component: 'path to the component (.ts or .vue file)',
  })
  .action((path: string) => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      skipLoadingLibFiles: true,
      useInMemoryFileSystem: true,
      // TODO: pass these options as CLI arguments.
      manipulationSettings: {
        newLineKind: NewLineKind.LineFeed,
        quoteKind: QuoteKind.Single,
        useTrailingCommas: false,
        indentationText: IndentationText.TwoSpaces,
      },
    })

    let mode: 'ts' | 'vue'

    if (path.endsWith('.vue')) {
      mode = 'vue'

    } else if (path.endsWith('.ts')) {
      mode = 'ts'

    } else {
      throw new Error('Path doesn\'t seem to be a .ts or .vue file.')
    }

    // TODO: pass the encoding as a CLI argument.
    const rwOptions = { encoding: 'utf-8' as const }
    const code = fs.readFileSync(path, rwOptions)
    fs.writeFileSync(path, declassify(project, code, mode), rwOptions)
    console.log(`Successfully declassified ${path}!`)
  })
  .parse(process.argv)
