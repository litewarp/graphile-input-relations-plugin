import type {GetPgCodecAttributes, GetPgResourceAttributes} from '@dataplan/pg';
import {inspect} from 'bun';
import {type SQL, sql} from 'postgraphile/pg-sql2';
import type {PgRelationInputData, PgTableResource} from '../interfaces.ts';

export function insertOne<TResource extends PgTableResource>(
  build: GraphileBuild.Build,
  resource: TResource,
  values: {input: Record<string, unknown>},
  selections: string[] = []
): SQL {
  const {behavior} = build;

  const resourceSource = resource.from;
  if (!sql.isSQL(resourceSource)) {
    throw new Error(
      `Error in relation-inputs-plugin: can only insert into resources defined as SQL, however ${
        resource.name
      } has ${inspect(resource.from)}`
    );
  }

  const name = resource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${resourceSource} as ${alias}`;

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
      ? sql` returning\n${sql.indent(sql.join(selectedAttrs, ',\n'))}`
      : sql.blank;

  const attrs: SQL[] = [];
  const vals: SQL[] = [];

  const tableFieldName = build.inflection.tableFieldName(resource);
  const input = values.input[tableFieldName] as Record<string, unknown>;

  const isInsertable = (key: string) =>
    behavior.pgCodecAttributeMatches([resource.codec, key], 'attribute:insert');

  for (const [attributeName, attribute] of Object.entries(
    resource.codec.attributes
  )) {
    if (!isInsertable(attributeName)) continue;

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

  return sql`insert into ${table} (${sql.join(attrs, ', ')}) values (${sql.join(vals, ', ')}) returning *`;
}

export function relationshipInsertSingle<
  TRelationship extends PgRelationInputData,
>(
  build: GraphileBuild.Build,
  relationship: TRelationship,
  input: Record<
    keyof GetPgResourceAttributes<TRelationship['remoteResource']>,
    unknown
  >,
  parent: Record<
    keyof GetPgCodecAttributes<TRelationship['localCodec']>,
    unknown
  >
) {
  const {sql} = build;
  const {localResource, matchedAttributes, remoteResource, isReferencee} =
    relationship;

  const insertOneSql = insertOne(build, remoteResource, {input});

  // if the foreign key is on the remote resource, we can just insert the remote resource
  if (isReferencee) return insertOneSql;

  const localTableName = localResource.name;
  const symbol = Symbol(localTableName);
  const alias = sql.identifier(symbol);
  const localTable = sql`${typeof localResource.from === 'function' ? localResource.from() : localResource.from} as ${alias}`;
  const withAlias = sql.identifier(Symbol(`with_${remoteResource.name}`));
  const sqlWhere: SQL[] = [];
  const sqlSet: SQL[] = [];
  const unique = localResource.uniques.find((u) =>
    u.attributes.every((a) => Object.keys(parent).includes(a))
  );
  if (!unique) {
    throw new Error('No unique constraint found');
  }

  for (const {local, remote} of matchedAttributes) {
    sqlSet.push(
      sql`${sql.identifier(local.name)} = ${sql.parens(sql`select ${sql.identifier(remote.name)} from ${withAlias}`)}`
    );
  }

  for (const attr of unique.attributes) {
    const value = parent[attr];
    const codec = localResource.codec.attributes[attr]?.codec;
    if (!value || !codec) {
      throw new Error(
        `Parent attribute ${attr} or codec for ${attr} not found`
      );
    }
    sqlWhere.push(
      sql`${sql.identifier(attr)} = ${sql.value(codec.toPg(value))}::${codec.sqlType}`
    );
  }

  const set = sql`set ${sql.join(sqlSet, ', ')}`;
  const where = sql`where ${sql.join(sqlWhere, ' and ')}`;

  return sql`with ${withAlias} as (${insertOneSql}) update ${localTable} ${set} ${where} returning *`;
}
