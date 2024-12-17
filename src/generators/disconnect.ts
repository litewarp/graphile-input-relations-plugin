import {type SQL, sql} from 'postgraphile/pg-sql2';
import {inspect} from '../inspect.ts';
import type {
  KeyFieldInfo,
  NodeFieldInfo,
  PgRelationInputData,
} from '../interfaces.ts';
import {decodeNodeId} from '../utils/node-id.ts';

interface ConnectOneArgs<
  TRelation extends PgRelationInputData = PgRelationInputData,
> {
  build: GraphileBuild.Build;
  relation: TRelation;
  fieldInfo: NodeFieldInfo | KeyFieldInfo;
  values: {input: Record<string, unknown>};
  parent?: Record<string, unknown>;
  selections?: string[];
}

/**
 * Either updates the foreign key on the remote resource
 * or it queries the remote resource to get the foreign key
 */
export function connectOne(obj: ConnectOneArgs): SQL {
  const {
    build: {getNodeIdHandler, inflection},
    relation,
    fieldInfo: {mode, unique},
    values,
    parent = {},
    selections = [],
  } = obj;

  const {isReferencee, localResource, remoteResource, matchedAttributes} =
    relation;

  const resourceSource = remoteResource.from;
  if (!sql.isSQL(resourceSource)) {
    throw new Error(
      `Error in relation-inputs-plugin: can only update into resources defined as SQL, however ${
        remoteResource.name
      } has ${inspect(remoteResource.from)}`
    );
  }
  const name = remoteResource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);

  const fieldName =
    mode === 'node'
      ? inflection.relationConnectNodeField(relation)
      : inflection.relationConnectByKeysField({...relation, unique});

  const input = (values.input[fieldName] ?? {}) as Record<string, unknown>;

  const getBys: SQL[] = [];
  const sqlSets: SQL[] = [];

  const allUniqAttr = remoteResource.uniques.flatMap((u) => u.attributes);
  const selected = [...new Set(allUniqAttr.concat(selections))].map(
    (attr, idx) => {
      const {codec} = remoteResource.codec.attributes[attr];
      if (!codec) {
        throw new Error(
          `Attribute ${attr} not found in ${remoteResource.name}`
        );
      }
      return sql.fragment`${sql.identifier(attr)}::${codec.sqlType} as ${sql.identifier(Symbol(idx))}`;
    }
  );

  // update remote resource
  if (isReferencee) {
    // add the foreign key to the remote resource
    for (const {local, remote} of matchedAttributes) {
      const value = parent[
        inflection.attribute({
          attributeName: local.name,
          codec: relation.localResource.codec,
        })
      ] as string | number;
      if (!value) {
        throw new Error(
          `Could not find value for ${local.name} to update in ${localResource.name}`
        );
      }
      sqlSets.push(
        sql.fragment`${sql.identifier(remote.name)} = ${sql.value(value)}::${remote.codec.sqlType}`
      );
    }
    if (mode === 'node') {
      const handler =
        getNodeIdHandler &&
        getNodeIdHandler(inflection.tableType(remoteResource.codec.name));
      if (!handler) {
        throw new Error(`No nodeId handler found for ${remoteResource.name}`);
      }
      const spec = decodeNodeId(
        handler,
        input[inflection.nodeIdFieldName()],
        remoteResource
      );
      if (!spec) {
        throw new Error(`Could not decode nodeId for ${remoteResource.name}`);
      }
      for (const [attr, value] of spec) {
        const codec = remoteResource.codec.attributes[attr].codec;
        getBys.push(
          sql.fragment`${sql.identifier(attr)} = ${sql.value(value)}::${codec.sqlType}`
        );
      }
    } else if (mode === 'keys') {
      for (const attr of unique.attributes) {
        const codec = remoteResource.codec.attributes[attr].codec;
        const inflected = inflection.attribute({
          attributeName: attr,
          codec: remoteResource.codec,
        });
        const value = input[inflected] as string | number;
        getBys.push(
          sql.fragment`${sql.identifier(attr)} = ${sql.value(value)}::${codec.sqlType}`
        );
      }
    }
  } else {
    // forward relation
    // don't need to do anything but select the remote resource's keys
  }

  const table = sql`${resourceSource} as ${alias}`;
  const sets = sql.join(sqlSets, ', ');
  const where = sql.join(getBys, ' and ');
  const returning =
    selected.length > 0
      ? sql`returning\n${sql.join(selected, ',\n')}`
      : sql.blank;

  const query = isReferencee
    ? sql`update ${table} set ${sets} where ${where} returning ${returning}`
    : sql`select ${returning} from ${table} where ${where}`;

  return query;
}
