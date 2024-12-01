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
import {type PgCodecRelationWithName, type PgTableResource} from '../helpers.ts';
import {inspect} from '../inspect.ts';

export function pgRelationshipReverseInsertStep<
  TRelationship extends PgCodecRelationWithName,
>(
  build: GraphileBuild.Build,
  $items: ListStep<__InputObjectStep[]>,
  $parent: PgInsertSingleStep | PgUpdateSingleStep,
  relationship: TRelationship
  // selections: [] = []
): ExecutableStep {
  const {inflection, sql} = build;

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
      `Error in nested create field: can only insert into resources defined as SQL, however ${remoteResource.name} has ${inspect(remoteResource.from)}`
    );
  }

  const name = remoteResource.name;
  const symbol = Symbol(name);
  const alias = sql.identifier(symbol);
  const table = sql`${remoteResource.from} as ${alias}`;
  const attrs: SQL[] = [];
  const vals: SQL[][] = [];
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
      const {codec} = remoteResource;

      const insertableAttributes: PgTableResource['codec']['attributes'] = Object.entries(
        codec.attributes
      )
        .filter(
          ([name, a]) =>
            !!a.codec &&
            build.behavior.pgCodecAttributeMatches([codec, name], 'attribute:insert')
        )
        .reduce((memo, [k, v]) => ({...memo, [k]: v}), {});

      const remappedKeys = Object.keys(insertableAttributes).reduce(
        (memo, attributeName) => {
          return {...memo, [inflection.attribute({attributeName, codec})]: attributeName};
        },
        {} as Record<string, string>
      );

      items.forEach((item) => {
        const childVals: SQL[] = [];
        Object.entries(remappedKeys).forEach(([camel, snake]) => {
          const attrCodec = insertableAttributes[snake]?.codec;
          const parentVal = parentKeys[snake];
          const itemVal = item[camel];
          if (!attrCodec || (!parentVal && !itemVal)) {
            return;
          }

          if (!attrs.includes(sql.identifier(snake))) {
            attrs.push(sql.identifier(snake));
          }
          if (parentVal) {
            childVals.push(
              sql`${sql.value(attrCodec.toPg(parentVal))}::${attrCodec.sqlType}`
            );
          } else {
            childVals.push(
              sql`${sql.value(attrCodec.toPg(itemVal))}::${attrCodec.sqlType}`
            );
          }
        });
        vals.push(childVals);
      });

      const insertedValues = vals.map((v) => sql`(${sql.join(v, ', ')})`);
      const query = sql`insert into ${table} (${sql.join(attrs, ', ')}) values ${sql.join(insertedValues, ', ')} returning *`;

      const res = await client.withTransaction((tx) => tx.query(sql.compile(query)));
      return res.rows[0];
    }
  );
}
