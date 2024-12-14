import type {} from '@dataplan/pg';
import {type SQL, sql} from 'postgraphile/pg-sql2';
import {inspect} from '../inspect.ts';
import type {PgTableResource} from '../interfaces.ts';

export function updateOne<TResource extends PgTableResource>(
  build: GraphileBuild.Build,
  resource: TResource,
  values: {input: Record<string, unknown>},
  selections: string[] = []
): SQL {
  const {behavior} = build;

  const resourceSource = resource.from;
  if (!sql.isSQL(resourceSource)) {
    throw new Error(
      `Error in relation-inputs-plugin: can only update into resources defined as SQL, however ${
        resource.name
      } has ${inspect(resource.from)}`
    );
  }

  const name = resource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${resourceSource} as ${alias}`;
  const getBy: SQL[] = [];
  const sqlSets: SQL[] = [];
  const attrs: SQL[] = [];
  const vals: SQL[] = [];

  const allUniqAttr = resource.uniques.flatMap((u) => u.attributes);

  // always include unique keys in the selection set for now
  const selectedAttrs = [...new Set(allUniqAttr.concat(selections))].map(
    (attr, idx) => {
      const {codec} = resource.codec.attributes[attr];
      if (!codec) {
        throw new Error(`Attribute ${attr} not found in ${resource.name}`);
      }
      return sql`${sql.identifier(attr)}::${codec.sqlType} as ${sql.identifier(Symbol(idx))}`;
    }
  );

  const returning =
    selectedAttrs.length > 0
      ? sql`returning\n${sql.indent(sql.join(selectedAttrs, ',\n'))}`
      : sql.blank;

  const tableFieldName = build.inflection.tableFieldName(resource);
  const input = values.input[tableFieldName] as Record<string, unknown>;

  const isUpdatable = (key: string) =>
    behavior.pgCodecAttributeMatches([resource.codec, key], 'attribute:update');

  for (const [attributeName, attribute] of Object.entries(
    resource.codec.attributes
  )) {
    if (!isUpdatable(attributeName)) continue;

    const fieldName = build.inflection.attribute({
      attributeName,
      codec: resource.codec,
    });

    const fieldValue = input[fieldName];

    if (!fieldValue) continue;
    attrs.push(sql.identifier(attributeName));
    vals.push(
      sql`${sql.value(attribute.codec.toPg(fieldValue))}::${attribute.codec.sqlType}`
    );
  }

  return sql`update ${table} (${sql.join(attrs, ', ')}) values (${sql.join(vals, ', ')}) ${returning}`;
}
