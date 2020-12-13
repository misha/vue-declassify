import program from 'commander'
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph'

program
  .name('vue-declassify')
  .version('1.0.0')
  .command('transform <path>')
  .description('Transforms the components of the target project.', {
    path: 'The path of the project (must have a tsconfig.json).',
  })
  .action(path => {
    const project = new Project({
      tsConfigFilePath: `${path}/tsconfig.json`,
      manipulationSettings: {
        newLineKind: NewLineKind.LineFeed,
        quoteKind: QuoteKind.Single,
        useTrailingCommas: false,
        indentationText: IndentationText.TwoSpaces,
      },
    })

    // Then presumably use this project to produce source files for declassify().
    console.log(project.getSourceFiles().map(file => file.getFilePath()))
  })
  .parse(process.argv)
