import { ImportDeclaration, SourceFile } from 'ts-morph'

function find(source: SourceFile, module: string): ImportDeclaration | undefined {
  return source.getImportDeclaration(declaration => {
    return declaration.getModuleSpecifierValue() === module
  })
}

export function remove(source: SourceFile, ...modules: string[]) {
  for (const module of modules) {
    const declaration = find(source, module)
  
    if (declaration) {
      declaration.remove()
    }
  }
}

export function ensure(source: SourceFile, module: string, imports: {
  default?: string,
  named?: string[],
}) {
  let declaration = find(source, module)

  if (!declaration) {
    declaration = source.addImportDeclaration({
      moduleSpecifier: module,
    })
  }

  if (imports.default) {
    declaration.setDefaultImport(imports.default)
  }

  if (imports.named) {
    const existingNamedImports = new Set(declaration.getNamedImports().map(specifier => specifier.getName()))
    const newNamedImports = imports.named.filter(name => !existingNamedImports.has(name))

    declaration.addNamedImports(
      newNamedImports.map(name => ({
        name,
      }))
    )
  }
}
