import fs from 'fs'
import path from 'path'
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
      // Until then, just change them for your projects before building.
      manipulationSettings: {
        newLineKind: NewLineKind.LineFeed,
        quoteKind: QuoteKind.Single,
        useTrailingCommas: false,
        indentationText: IndentationText.TwoSpaces,
      },
    })
  })
  .parse(process.argv)
