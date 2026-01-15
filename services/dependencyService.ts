import * as ts from 'typescript';
import { FileContext, DependencyGraphData } from '../types';

export const generateDependencyGraph = (files: FileContext[]): DependencyGraphData => {
  const nodes = files.map(f => ({
    id: f.name,
    name: f.name,
    type: f.type,
    val: 1
  }));

  const links: { source: string; target: string }[] = [];
  const filePaths = new Set(files.map(f => f.name));

  files.forEach(file => {
    if (file.type === 'file') {
      let imports: string[] = [];

      // 1. Choose Parser
      if (file.name.match(/\.(ts|tsx|js|jsx)$/)) {
        imports = parseJsTsImports(file.content, file.name);
      } else if (file.name.endsWith('.py')) {
        imports = parsePythonImports(file.content);
      }

      // 2. Resolve & Link
      imports.forEach(imp => {
        const target = resolveImport(file.name, imp, filePaths);
        if (target) {
          links.push({ source: file.name, target: target });
        }
      });
    }
  });

  return { nodes, links };
};

/**
 * Parses JS/TS content into an AST to extract imports reliably.
 * Uses ts.createSourceFile which is safe for browser environments.
 */
const parseJsTsImports = (content: string, fileName: string): string[] => {
  const imports: string[] = [];

  try {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true // setParentNodes
    );

    const visit = (node: ts.Node) => {
      // Import Declaration: import { x } from './y'
      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push(node.moduleSpecifier.text);
        }
      }
      // Export Declaration: export { x } from './y'
      else if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push(node.moduleSpecifier.text);
        }
      }
      // Dynamic Imports & Require
      else if (ts.isCallExpression(node)) {
        // require('x')
        if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
            imports.push((node.arguments[0] as ts.StringLiteral).text);
          }
        }
        // import('x')
        else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
            imports.push((node.arguments[0] as ts.StringLiteral).text);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  } catch (e) {
    console.warn(`AST parsing failed for ${fileName}, falling back to regex`, e);
    return fallbackRegexExtract(content);
  }

  return imports;
};

const parsePythonImports = (content: string): string[] => {
  const imports: string[] = [];
  const pyFromRegex = /from\s+(\S+)\s+import/g;
  const pyImportRegex = /^import\s+(\S+)/gm;

  let match;
  while ((match = pyFromRegex.exec(content)) !== null) imports.push(match[1]);
  while ((match = pyImportRegex.exec(content)) !== null) imports.push(match[1]);
  return imports;
};

const fallbackRegexExtract = (content: string): string[] => {
  const regex = /import\s+[\s\S]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1] || match[2]);
  }
  return imports;
};

/**
 * Resolves an import path against the file structure.
 * Handles:
 * 1. Relative paths (./, ../) using virtual path resolution.
 * 2. Exact matches.
 * 3. Extension resolution (.ts, .tsx, .js added automatically).
 */
const resolveImport = (sourceFile: string, importPath: string, allFiles: Set<string>): string | undefined => {
  // 1. Handle Relative Imports
  if (importPath.startsWith('.')) {
    // Get directory of source file
    const sourceDirParts = sourceFile.split('/');
    sourceDirParts.pop(); // Remove filename

    const importParts = importPath.split('/');

    // Resolve ".." and "."
    for (const part of importParts) {
      if (part === '.') continue;
      if (part === '..') {
        if (sourceDirParts.length > 0) sourceDirParts.pop();
      } else {
        sourceDirParts.push(part);
      }
    }

    const resolvedBase = sourceDirParts.join('/');

    // Try extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
      const candidate = resolvedBase + ext;
      if (allFiles.has(candidate)) return candidate;
    }
  }

  // 2. Handle Absolute/Alias Imports (Simple match)
  if (allFiles.has(importPath)) return importPath;

  // 3. Fallback: Basename match (For loose project structures or aliases like @/components)
  // Check if any file path ends with the import path (ignoring extension)
  const importBase = importPath.split('/').pop();
  if (!importBase) return undefined;

  for (const file of allFiles) {
    const fileNoExt = file.replace(/\.[^/.]+$/, "");
    if (fileNoExt.endsWith(importPath) || fileNoExt.endsWith('/' + importPath)) {
      return file;
    }
  }

  return undefined;
};