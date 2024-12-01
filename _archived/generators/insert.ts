import type {GetPgResourceAttributes} from '@dataplan/pg';
import type {SQL} from 'postgraphile/pg-sql2';
import type {PgTableResource} from '../helpers.ts';
import type {PgRelationshipMutationsRelationshipData} from '../relationships.ts';

export function insertOne<
  TResource extends PgTableResource,
  TAttributes extends GetPgResourceAttributes<TResource>,
>(
  build: GraphileBuild.Build,
  resource: TResource,
  values: Record<string, unknown>,
  _selections: string[] = []
): SQL {
  const {sql} = build;
  const name = resource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${typeof resource.from === 'function' ? resource.from() : resource.from} as ${alias}`;
  const attrs: SQL[] = [];
  const vals: SQL[] = [];

  const tableFieldName = build.inflection.tableFieldName(resource);
  const input = values.input[tableFieldName];

  Object.entries(resource.codec.attributes).forEach(([attributeName, attribute]) => {
    const fieldName = build.inflection.attribute({attributeName, codec: resource.codec});
    const fieldValue = input[fieldName];
    if (!fieldValue) return;
    attrs.push(sql.identifier(attributeName));
    vals.push(
      sql`${sql.value(attribute.codec.toPg(fieldValue))}::${attribute.codec.sqlType}`
    );
  });

  return sql`insert into ${table} (${sql.join(attrs, ', ')}) values (${sql.join(vals, ', ')}) returning *`;
}

export function relationshipInsertSingle<
  TRelationship extends PgRelationshipMutationsRelationshipData,
>(
  build: GraphileBuild.Build,
  relationship: TRelationship,
  input: Record<keyof GetPgResourceAttributes<TRelationship['remoteResource']>, unknown>,
  parent: Record<keyof GetPgResourceAttributes<TRelationship['localResource']>, unknown>
) {
  const {sql} = build;
  const {localAttributes, localResource, remoteAttributes, remoteResource, isReferencee} =
    relationship;

  const insertOneSql = insertOne(build, remoteResource, input);

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

  localAttributes.forEach(({name}, index) => {
    const remoteAttr = remoteAttributes[index];
    if (!remoteAttr) {
      throw new Error(`Matching attribute not found for local attribute ${name}`);
    }
    sqlSet.push(
      sql`${sql.identifier(name)} = ${sql.parens(sql`select ${sql.identifier(remoteAttr.name)} from ${withAlias}`)}`
    );
  });

  unique.attributes.forEach((attr) => {
    const value = parent[attr];
    const codec = localResource.codec.attributes[attr]?.codec;
    if (!value || !codec) {
      throw new Error(`Parent attribute ${attr} or codec for ${attr} not found`);
    }
    sqlWhere.push(
      sql`${sql.identifier(attr)} = ${sql.value(codec.toPg(value))}::${codec.sqlType}`
    );
  });

  const set = sql`set ${sql.join(sqlSet, ', ')}`;
  const where = sql`where ${sql.join(sqlWhere, ' and ')}`;

  return sql`with ${withAlias} as (${insertOneSql}) update ${localTable} ${set} ${where} returning *`;
}
