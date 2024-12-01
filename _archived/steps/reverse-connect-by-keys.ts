import {
  PgInsertSingleStep,
  PgUpdateSingleStep,
  withPgClientTransaction,
} from '@dataplan/pg';
import {
  type ExecutableStep,
  ListStep,
  type __InputObjectStep,
  list,
  object,
} from 'postgraphile/grafast';
import {type SQL} from 'postgraphile/pg-sql2';
import {type PgCodecRelationWithName} from '../helpers.ts';
import {inspect} from '../inspect.ts';

export function pgRelationshipReverseConnectByKeysStep<
  TRelationship extends PgCodecRelationWithName,
>(
  build: GraphileBuild.Build,
  $items: ListStep<__InputObjectStep[]>,
  $parent: PgInsertSingleStep | PgUpdateSingleStep,
  relationship: TRelationship
  // selections: [] = []
): ExecutableStep {
  const {sql} = build;

  const {localAttributes, remoteAttributes, remoteResource} = relationship;

  // perform validations
  if (
    !($items instanceof ListStep) ||
    !($parent instanceof PgInsertSingleStep || $parent instanceof PgUpdateSingleStep)
  ) {
    throw new Error(
      `$items must be a ListStep and $parent must be a PgInsertSingleStep or PgUpdateSingleStep`
    );
  }

  if (!sql.isSQL(remoteResource.from)) {
    throw new Error(
      `Error in nested connect by Id field: can only connect resources defined as SQL, however ${remoteResource.name} has ${inspect(remoteResource.from)}`
    );
  }

  const name = remoteResource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${remoteResource.from} as ${alias}`;
  const sqlSets: SQL[] = [];
  const sqlWhereClauses: SQL[][] = [];
  // const sels = new Map<string, PgCodec>();

  const $parentKeys = object<Record<string, ExecutableStep>>({
    ...localAttributes.reduce((memo, attr, index) => {
      return remoteAttributes[index]
        ? {...memo, [remoteAttributes[index]]: $parent.get(attr)}
        : memo;
    }, {}),
  });

  return withPgClientTransaction(
    remoteResource.executor,
    list([$items, $parentKeys]),
    async (client, [items, parentKeys]) => {
      Object.entries(parentKeys).forEach(([key, value]) => {
        const attrCodec = remoteResource.codec.attributes[key]?.codec;
        if (!attrCodec) return;

        sqlSets.push(
          sql`${sql.identifier(key)} = ${sql.value(attrCodec.toPg(value))}::${attrCodec.sqlType}`
        );
        items.forEach((obj) => {
          const whereClauses: SQL[] = [];
          Object.entries(obj).forEach(([attr, childId]) => {
            const remoteAttrCodec = remoteResource.codec.attributes[attr]?.codec;
            if (remoteAttrCodec) {
              whereClauses.push(
                sql`${sql.identifier(attr)} = ${sql.value(remoteAttrCodec.toPg(childId))}::${remoteAttrCodec.sqlType}`
              );
            }
          });
          sqlWhereClauses.push(whereClauses);
        });
      });
      const set = sql` set ${sql.join(sqlSets, ', ')}`;
      const where = sql` where ${sql.join(
        sqlWhereClauses.map((clause) => sql`${sql.join(clause, ' and ')}`),
        ' or '
      )}`;

      const query = sql`update ${table}${set}${where} returning *`;

      const res = await client.withTransaction((tx) =>
        tx.query(sql.compile(query)).then((r) => r.rows)
      );

      return res;
    }
  );
}
