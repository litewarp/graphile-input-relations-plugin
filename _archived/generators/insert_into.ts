import type {GetPgCodecAttributes, GetPgResourceAttributes} from '@dataplan/pg';
import type {SQL} from 'postgraphile/pg-sql2';
import type {PgCodecRelationWithName, PgTableResource} from '../helpers.ts';

export function insertOne<
  TResource extends PgTableResource,
  TAttributes extends GetPgResourceAttributes<TResource>,
>(
  build: GraphileBuild.Build,
  resource: TResource,
  values: Record<keyof TAttributes, unknown>,
  _selections: string[] = []
): SQL {
  const {sql} = build;
  const name = resource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${typeof resource.from === 'function' ? resource.from() : resource.from} as ${alias}`;
  const attrs: SQL[] = [];
  const vals: SQL[] = [];

  Object.entries(resource.codec.attributes).forEach(([attributeName, attribute]) => {
    const fieldValue = values[attributeName];
    if (!fieldValue) return;
    attrs.push(sql.identifier(attributeName));
    vals.push(
      sql`${sql.value(attribute.codec.toPg(fieldValue))}::${attribute.codec.sqlType}`
    );
  });

  return sql`insert into ${table} (${sql.join(attrs, ', ')}) values (${sql.join(vals, ', ')}) returning *`;
}

export function insertOneChildAndUpdateParent<
  TRelationship extends PgCodecRelationWithName,
  TInsertValues = GetPgResourceAttributes<TRelationship['remoteResource']>,
>(
  build: GraphileBuild.Build,
  relationship: TRelationship,
  values: Record<keyof TInsertValues, unknown>,
  parentKeys: Record<string, unknown>
) {
  const {sql} = build;
  const resource = build.input.pgRegistry.pgResources[
    relationship.resource
  ] as PgTableResource;

  const resourceUnique = resource.uniques.find((u) => u.isPrimary);
  if (!resourceUnique) {
    throw new Error(
      `Resource ${resource.name} does not have a primary unique constraint`
    );
  }

  const {isReferencee} = relationship;
  if (isReferencee) {
    throw new Error(
      'insertOneChildAndUpdateParent should only be used for forward relationships'
    );
  }

  const name = resource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const withAlias = sql.identifier(Symbol(`with_${relationship.remoteResource.name}`));
  const table = sql`${typeof resource.from === 'function' ? resource.from() : resource.from} as ${alias}`;
  const sqlSet: SQL[] = [];
  const sqlWhere: SQL[] = [];

  const insertSql = insertOne(build, relationship.remoteResource, values);

  relationship.localAttributes.forEach((local, idx) => {
    const remote = relationship.remoteAttributes[idx];
    if (!remote || !local)
      throw new Error('Invalid relationship - missing remote or local attribute');
    sqlSet.push(
      sql`${sql.identifier(local)} = select *.${sql.identifier(remote)} from ${withAlias}`
    );
  });

  resourceUnique.attributes.forEach((attr) => {
    const value = parentKeys[attr];
    const attrCodec = resource.codec.attributes[attr]?.codec;
    if (value && attrCodec) {
      sqlWhere.push(
        sql`${sql.identifier(attr)} = ${sql.value(attrCodec.toPg(value))}::${attrCodec.sqlType}`
      );
    }
  });

  const set = sql` set ${sql.join(sqlSet, ', ')}`;
  const where = sql` where ${sql.join(sqlWhere, ' and ')}`;

  return sql`with ${withAlias} as (${insertSql}) update ${table}${set}${where} returning *`;
}

export function connectOne<
  TRelationship extends PgCodecRelationWithName,
  TAttributes = GetPgCodecAttributes<TRelationship['localCodec']>,
  TRemoteAttributes = GetPgResourceAttributes<TRelationship['remoteResource']>,
>(
  build: GraphileBuild.Build,
  relationship: TRelationship,
  localKeys: Record<keyof TAttributes, unknown>,
  remoteKeys: Record<keyof TRemoteAttributes, unknown>,
  _selections: string[] = []
): SQL {
  const {
    name: relationName,
    resource,
    localAttributes,
    remoteAttributes,
    remoteResource,
    localCodec,
    isReferencee,
  } = relationship;

  const tableResource = isReferencee
    ? remoteResource
    : (build.input.pgRegistry.pgResources[resource] as PgTableResource);

  const {sql} = build;
  const name = `${localCodec.name}_${relationName}`;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${typeof tableResource.from === 'function' ? tableResource.from() : tableResource.from} as ${alias}`;
  const sqlSet: SQL[] = [];
  const sqlWhere: SQL[] = [];

  remoteAttributes.forEach((remote, idx) => {
    const rAttrCodec = remoteResource.codec.attributes[remote]?.codec;
    const remoteId = remoteKeys[remote as keyof TRemoteAttributes];
    const local = localAttributes[idx];
    const localId = localKeys[local as keyof TAttributes];
    const lAttrCodec = local && localCodec.attributes[local]?.codec;
    if (remoteId && rAttrCodec && localId && lAttrCodec) {
      sqlWhere.push(
        sql`${sql.identifier(isReferencee ? remote : local)} = ${sql.value(isReferencee ? rAttrCodec.toPg(localId) : lAttrCodec.toPg(remoteId))}::${isReferencee ? rAttrCodec.sqlType : lAttrCodec.sqlType}`
      );
      sqlSet.push(
        sql`${sql.identifier(isReferencee ? local : remote)} = ${sql.value(isReferencee ? lAttrCodec.toPg(remoteId) : rAttrCodec.toPg(localId))}::${isReferencee ? rAttrCodec.sqlType : lAttrCodec.sqlType}`
      );
    }
  });

  const set = sql` set ${sql.join(sqlSet, ', ')}`;
  const where = sql` where ${sql.join(sqlWhere, ' and ')}`;

  return sql`update ${table}${set}${where} returning *`;
}
