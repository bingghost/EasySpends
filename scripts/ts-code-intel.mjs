#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import ts from 'typescript6'

const root = process.cwd()
const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')

if (!configPath) {
  throw new Error(`No tsconfig.json found from ${root}`)
}

const config = ts.readConfigFile(configPath, ts.sys.readFile)
if (config.error) {
  throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
}

const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), undefined, configPath)
if (parsed.errors.length > 0) {
  throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
}

const host = {
  getCompilationSettings: () => parsed.options,
  getCurrentDirectory: () => root,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  getDirectories: ts.sys.getDirectories,
  getNewLine: () => ts.sys.newLine,
  getScriptFileNames: () => parsed.fileNames,
  getScriptSnapshot(fileName) {
    const contents = ts.sys.readFile(fileName)
    return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents)
  },
  getScriptVersion: () => '0',
  readDirectory: ts.sys.readDirectory,
  readFile: ts.sys.readFile,
  fileExists: ts.sys.fileExists,
  directoryExists: ts.sys.directoryExists,
  realpath: ts.sys.realpath,
  useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames
}

const service = ts.createLanguageService(host, ts.createDocumentRegistry())

function sourceFile(fileName) {
  const fromProgram = service.getProgram()?.getSourceFile(fileName)
  if (fromProgram) return fromProgram

  const text = ts.sys.readFile(fileName)
  if (text === undefined) throw new Error(`Cannot read ${fileName}`)
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
}

function location(fileName, span) {
  const source = sourceFile(fileName)
  const start = source.getLineAndCharacterOfPosition(span.start)
  const end = source.getLineAndCharacterOfPosition(span.start + span.length)
  const fullLineText = source.text.slice(source.getLineStarts()[start.line], source.getLineEndOfPosition(span.start)).trim()
  const lineText = fullLineText.length > 200 ? `${fullLineText.slice(0, 197)}...` : fullLineText
  return {
    file: path.relative(root, fileName) || path.basename(fileName),
    line: start.line + 1,
    column: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
    text: lineText
  }
}

function inputFile(value) {
  if (!value) throw new Error('A source file is required')
  const fileName = path.resolve(root, value)
  if (!parsed.fileNames.includes(fileName)) {
    throw new Error(`${value} is not included by tsconfig.json`)
  }
  return fileName
}

function position(fileName, lineValue, columnValue) {
  const line = Number(lineValue)
  const column = Number(columnValue)
  if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) {
    throw new Error('Line and column must be positive, one-based integers')
  }

  const source = sourceFile(fileName)
  const lineStarts = source.getLineStarts()
  if (line > lineStarts.length) throw new Error(`Line ${line} is outside ${path.relative(root, fileName)}`)
  return lineStarts[line - 1] + column - 1
}

function navigationItem(fileName, item) {
  return {
    name: item.text,
    kind: item.kind,
    location: location(fileName, item.nameSpan ?? item.spans[0]),
    children: (item.childItems ?? []).map((child) => navigationItem(fileName, child))
  }
}

function hierarchyItem(item) {
  return {
    name: item.name,
    kind: item.kind,
    container: item.containerName ?? null,
    location: location(item.file, item.selectionSpan)
  }
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'outline': {
    const fileName = inputFile(args[0])
    print(navigationItem(fileName, service.getNavigationTree(fileName)))
    break
  }
  case 'symbols': {
    if (!args[0]) throw new Error('A symbol query is required')
    const fileName = args[1] ? inputFile(args[1]) : undefined
    print(service.getNavigateToItems(args[0], 100, fileName, true, true).map((item) => ({
      name: item.name,
      kind: item.kind,
      container: item.containerName,
      location: location(item.fileName, item.textSpan)
    })))
    break
  }
  case 'definition':
  case 'references':
  case 'implementations':
  case 'incoming-calls':
  case 'outgoing-calls': {
    const fileName = inputFile(args[0])
    const offset = position(fileName, args[1], args[2])

    if (command === 'definition') {
      print((service.getDefinitionAtPosition(fileName, offset) ?? []).map((item) => location(item.fileName, item.textSpan)))
    } else if (command === 'references') {
      print((service.getReferencesAtPosition(fileName, offset) ?? []).map((item) => ({
        ...location(item.fileName, item.textSpan),
        definition: item.isDefinition ?? false,
        write: item.isWriteAccess
      })))
    } else if (command === 'implementations') {
      print((service.getImplementationAtPosition(fileName, offset) ?? []).map((item) => location(item.fileName, item.textSpan)))
    } else if (command === 'incoming-calls') {
      print(service.provideCallHierarchyIncomingCalls(fileName, offset).map((item) => ({
        from: hierarchyItem(item.from),
        callSites: item.fromSpans.map((span) => location(item.from.file, span))
      })))
    } else {
      print(service.provideCallHierarchyOutgoingCalls(fileName, offset).map((item) => ({
        to: hierarchyItem(item.to),
        callSites: item.fromSpans.map((span) => location(fileName, span))
      })))
    }
    break
  }
  default:
    throw new Error('Usage: pnpm code:intel <outline FILE | symbols QUERY [FILE] | definition|references|implementations|incoming-calls|outgoing-calls FILE LINE COLUMN>')
}
