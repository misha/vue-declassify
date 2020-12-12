import { ImportDeclaration, SourceFile } from 'ts-morph'

function findImport(source: SourceFile, module: string): ImportDeclaration | undefined {
  return source.getImportDeclaration(declaration => {
    return declaration.getModuleSpecifierValue() === module
  })
}

export function removeImport(source: SourceFile, module: string) {
  const declaration = findImport(source, module)

  if (declaration) {
    declaration.remove()
  }
}

export function ensureImport(source: SourceFile, module: string, imports: {
  default?: string,
  named?: string[],
}) {
  let declaration = findImport(source, module)

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
