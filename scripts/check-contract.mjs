/**
 * Comprueba que `src/app/core/models.ts` sigue diciendo lo mismo que el contrato OpenAPI de
 * la API.
 *
 * Los tipos se escriben a mano a propósito —se leen mejor que los generados—, pero entonces
 * nada obliga a que sigan al contrato. El backend sí está atado: genera sus interfaces del
 * mismo `finscope-api.yaml` y una discrepancia no compila. El frontend no tenía nada
 * parecido, así que un campo nuevo, renombrado u obligatorio pasaba sin ruido hasta que
 * fallaba en el navegador.
 *
 * Qué compara:
 * - La versión: `CONTRACT_VERSION` en `models.ts` contra `info.version` del contrato. Es la
 *   alarma gruesa: si la API publica una versión nueva, alguien tiene que mirarla.
 * - Cada esquema objeto del contrato contra el tipo del mismo nombre: los mismos campos, y
 *   obligatorios los mismos. Un campo que el contrato exige y aquí es opcional obliga a
 *   comprobar un nulo que nunca llega; uno opcional que aquí es obligatorio hace creer que
 *   siempre llega.
 * - Cada enumeración contra la unión de literales del mismo nombre.
 *
 * Los esquemas que son un texto con formato (`ChipColor`, `UserAvatar`…) no se comparan: en
 * el frontend son `string`. Los que aquí van en línea dentro de otro tipo se listan en
 * `INLINED`, con el motivo.
 *
 * Uso:
 *     node scripts/check-contract.mjs                 # el contrato publicado en `master`
 *     node scripts/check-contract.mjs <ruta|url>      # otro, p. ej. el de la API en local:
 *     node scripts/check-contract.mjs ../finscope-api/src/main/resources/openapi/finscope-api.yaml
 *
 * Lee el YAML con un analizador de líneas y no con una biblioteca: el contrato está escrito
 * con una sangría fija de dos espacios y solo hace falta su sección de esquemas. Si un día el
 * contrato cambia de forma, el script no lo malinterpreta en silencio: deja de encontrar
 * esquemas y falla.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DEFAULT_SOURCE =
  'https://raw.githubusercontent.com/sebastian-reyes/finscope-api/master/src/main/resources/openapi/finscope-api.yaml';

const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/app/core/models.ts');

/** Esquemas objeto del contrato que el frontend no declara como tipo propio, y por qué. */
const INLINED = {
  RefreshTokenRequest: 'un único campo; `AuthService.refresh` lo escribe en línea',
  PushSubscriptionKeys: 'va en línea dentro de `SavePushSubscriptionRequest.keys`',
};

async function readContract(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el contrato (${response.status}): ${source}`);
    }
    return response.text();
  }
  return readFileSync(source, 'utf8');
}

/**
 * `[a, b]` en la misma línea, `[a, b]` partida en las siguientes —el contrato las parte al
 * pasar de cierto ancho— o una lista en bloque (`- a`) que empieza en `lines[from]`.
 */
function readList(inline, lines, from, indent) {
  if (!inline && lines[from]?.trim().startsWith('[')) {
    inline = '';
    for (let i = from; i < lines.length && !inline.includes(']'); i++) {
      inline += lines[i].trim();
    }
  }
  if (inline) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const items = [];
  const item = new RegExp(`^${' '.repeat(indent)}- (.+)$`);
  for (let i = from; i < lines.length; i++) {
    const match = item.exec(lines[i]);
    if (!match) break;
    items.push(match[1].trim().replace(/^["']|["']$/g, ''));
  }
  return items;
}

function parseContract(text) {
  const lines = text.split(/\r?\n/);
  const infoAt = lines.findIndex((line) => line === 'info:');
  const versionLine = lines.slice(infoAt + 1).find((line) => /^ {2}version:/.test(line));
  const version = versionLine
    ?.split(':')[1]
    .trim()
    .replace(/^["']|["']$/g, '');

  const start = lines.findIndex((line) => line === '  schemas:');
  if (infoAt < 0 || !version || start < 0) {
    throw new Error(
      'El contrato no tiene la forma esperada: falta `info.version` o `components.schemas`.',
    );
  }

  const schemas = new Map();
  let current = null;
  let inProperties = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {0,2}\S/.test(line)) break;

    const name = /^ {4}([A-Za-z0-9]+):\s*$/.exec(line);
    if (name) {
      current = { type: null, properties: [], required: [], enum: null };
      schemas.set(name[1], current);
      inProperties = false;
      continue;
    }
    if (!current) continue;

    const key = /^ {6}([A-Za-z]+):\s*(.*)$/.exec(line);
    if (key) {
      const [, field, value] = key;
      inProperties = field === 'properties';
      if (field === 'type') current.type = value.trim();
      if (field === 'required') current.required = readList(value.trim(), lines, i + 1, 8);
      if (field === 'enum') current.enum = readList(value.trim(), lines, i + 1, 8);
      continue;
    }
    const property = inProperties && /^ {8}([A-Za-z0-9]+):/.exec(line);
    if (property) current.properties.push(property[1]);
  }
  if (schemas.size === 0) {
    throw new Error('No se encontró ningún esquema en el contrato.');
  }
  return { version, schemas };
}

function readModels() {
  const program = ts.createProgram([MODELS], {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
  });
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(MODELS);
  const exports = new Map();
  let version = null;

  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(file))) {
    const declaration = symbol.declarations?.[0];
    if (!declaration) continue;

    if (ts.isVariableDeclaration(declaration) && symbol.name === 'CONTRACT_VERSION') {
      version =
        declaration.initializer && ts.isStringLiteral(declaration.initializer)
          ? declaration.initializer.text
          : null;
      continue;
    }
    if (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration))
      continue;

    const type = checker.getDeclaredTypeOfSymbol(symbol);
    if (type.isUnion() && type.types.every((member) => member.isStringLiteral())) {
      exports.set(symbol.name, { literals: type.types.map((member) => member.value) });
      continue;
    }
    exports.set(symbol.name, {
      properties: new Map(
        checker
          .getPropertiesOfType(type)
          .map((property) => [property.name, (property.flags & ts.SymbolFlags.Optional) !== 0]),
      ),
    });
  }
  return { version, exports };
}

function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function compare(contract, models) {
  const problems = [];

  if (models.version !== contract.version) {
    problems.push(
      `Versión: el contrato va por la ${contract.version} y models.ts declara ` +
        `CONTRACT_VERSION = ${models.version ?? '(ausente)'}.`,
    );
  }

  for (const [name, schema] of contract.schemas) {
    const model = models.exports.get(name);

    if (schema.enum) {
      if (!model) {
        problems.push(`${name}: el contrato lo define como enumeración y models.ts no lo declara.`);
      } else if (!model.literals || !sameSet(model.literals, schema.enum)) {
        problems.push(
          `${name}: el contrato admite [${schema.enum.join(', ')}] y models.ts ` +
            `[${model.literals?.join(', ') ?? 'no es una unión de literales'}].`,
        );
      }
      continue;
    }

    if (schema.type !== 'object' || name in INLINED) continue;

    if (!model?.properties) {
      problems.push(`${name}: el contrato lo define y models.ts no lo declara.`);
      continue;
    }
    for (const property of schema.properties) {
      if (!model.properties.has(property)) {
        problems.push(`${name}.${property}: está en el contrato y falta en models.ts.`);
        continue;
      }
      const required = schema.required.includes(property);
      const optional = model.properties.get(property);
      if (required && optional) {
        problems.push(`${name}.${property}: el contrato lo exige y models.ts lo marca opcional.`);
      }
      if (!required && !optional) {
        problems.push(`${name}.${property}: el contrato lo deja opcional y models.ts lo exige.`);
      }
    }
    for (const property of model.properties.keys()) {
      if (!schema.properties.includes(property)) {
        problems.push(`${name}.${property}: está en models.ts y el contrato no lo conoce.`);
      }
    }
  }
  return problems;
}

const source = process.argv[2] ?? DEFAULT_SOURCE;
const contract = parseContract(await readContract(source));
const models = readModels();
const problems = compare(contract, models);

if (problems.length > 0) {
  console.error(`models.ts no coincide con el contrato ${contract.version} (${source}):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nActualiza models.ts —y CONTRACT_VERSION— a lo que dice el contrato. Si un esquema se' +
      '\nescribe en línea a propósito, añádelo a INLINED en scripts/check-contract.mjs con el motivo.',
  );
  process.exit(1);
}

const compared = [...contract.schemas.values()].filter(
  (schema) => schema.enum || schema.type === 'object',
).length;
console.log(
  `models.ts coincide con el contrato ${contract.version}: ${compared} esquemas comparados.`,
);
