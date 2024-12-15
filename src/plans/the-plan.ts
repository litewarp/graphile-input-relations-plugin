import {
  type PgClient,
  type PgCodec,
  type PgCodecWithAttributes,
  type WithPgClientStep,
  withPgClientTransaction,
} from 'postgraphile/@dataplan/pg';
import {
  type ExecutableStep,
  type FieldArgs,
  type __InputObjectStep,
  list,
} from 'postgraphile/grafast';
import type {SQL} from 'postgraphile/pg-sql2';
import {connectOne} from '../generators/connect.ts';
import {insertOne} from '../generators/insert.ts';
import {updateOne} from '../generators/update.ts';
import type {PgTableResource} from '../interfaces.ts';

type PgCodecRecord<TCodec extends PgCodec> = Record<
  keyof TCodec['attributes'],
  TCodec['attributes'][keyof TCodec['attributes']]
>;

export function sqlGenerator(
  build: GraphileBuild.Build,
  resource: PgTableResource,
  context: {isUpdateField?: boolean}
): (
  $parent: ExecutableStep,
  args: FieldArgs
) => WithPgClientStep<
  [ExecutableStep, __InputObjectStep],
  Record<string, unknown>
> {
  const {inflection, sql} = build;
  const {isUpdateField} = context;

  async function recurseForwardMutations<
    TClient extends PgClient = PgClient,
    TRecord extends
      PgCodecRecord<PgCodecWithAttributes> = PgCodecRecord<PgCodecWithAttributes>,
  >(
    data: Record<string, unknown>,
    {input}: {input: Record<string, unknown>},
    client: TClient
  ): Promise<TRecord> {
    const relationFields = build.pgRelationInputsTypes[resource.name] ?? [];
    const output = Object.assign({}, input);

    await Promise.all(
      relationFields
        .filter((k) => input[k.fieldName])
        .map(
          async ({
            localCodec,
            fieldName,
            matchedAttributes,
            remoteResource,
          }) => {
            const value = input[fieldName] as Record<
              string,
              | Record<string, unknown>
              | Record<string, Record<string, unknown>[]>
            >;

            const inputFields =
              build.pgRelationInputsFields[remoteResource.name] ?? [];

            const updateFields = inputFields.filter(
              (r) => r.method === 'update'
            );

            const nodeUpdateName = inputFields.find(
              (r) => r.method === 'update' && r.mode === 'node'
            )?.fieldName;

            const createFields = inputFields.filter(
              (r) => r.method === 'create'
            );

            const connectFields = inputFields.filter(
              (r) => r.method === 'connect'
            );

            const disconnectFields = inputFields.filter(
              (r) => r.method === 'disconnect'
            );

            const deleteFields = inputFields.filter(
              (r) => r.method === 'delete'
            );

            if (nodeUpdateName && Object.keys(value).includes(nodeUpdateName)) {
              await Promise.all(
                Object.values<
                  Record<string, unknown> | Record<string, unknown>[]
                >(value).map((v) =>
                  Array.isArray(v)
                    ? v
                    : ([v] as Record<string, unknown>[]).map(
                        async (rowData) => {
                          const updateData = Object.assign(
                            {},
                            rowData,
                            await recurseForwardMutations(
                              data,
                              {input: rowData},
                              client
                            )
                          );

                          const resolver =
                            build.pgRelationSqlPlans[remoteResource.name];
                          if (!resolver) {
                            throw new Error(
                              `No resolver found for relation ${remoteResource.name}`
                            );
                          }
                          const resolveResult = await resolver(
                            data,
                            {input: updateData},
                            client
                          );

                          for (const {local, remote} of matchedAttributes) {
                            output[
                              inflection.attribute({
                                attributeName: local.name,
                                codec: localCodec,
                              })
                            ] = resolveResult[remote.name];
                          }
                        }
                      )
                )
              );
            }

            await Promise.all(
              connectFields
                .filter((f) => Boolean(value[f.fieldName]))
                .map((f) => {
                  const relation = (
                    build.pgRelationInputsTypes[remoteResource.name] ?? []
                  ).find((r) => r.relationName === f.relationName);

                  if (!relation) throw new Error('No relation found');

                  const sql = connectOne({
                    build,
                    relation,
                    fieldInfo: f,
                    values: {
                      input: value[fieldName] as Record<string, unknown>,
                    },
                  });
                  console.log(sql);
                  // run it
                })
            );

            await Promise.all(
              disconnectFields
                .filter((f) => Boolean(value[f.fieldName]))
                .map((f) => {
                  console.log('disconnect', f);
                })
            );

            await Promise.all(
              deleteFields
                .filter((f) => Boolean(value[f.fieldName]))
                .map((f) => {
                  console.log('delete', f);
                })
            );

            await Promise.all(
              updateFields
                .filter((f) => Boolean(value[f.fieldName]))
                .map((f) => {
                  console.log('update', f);
                })
            );

            await Promise.all(
              createFields
                .filter((f) => Boolean(value[f.fieldName]))
                .map((f) => {
                  console.log('create', f);
                })
            );
          }
        )
    );
    return output as TRecord;
  }

  async function mutationResolver(
    parent: Record<string, unknown>,
    {input}: {input: Record<string, unknown>},
    client: PgClient
  ): Promise<Record<string, unknown>> {
    const tableFieldName = isUpdateField
      ? inflection.patchField(inflection.tableFieldName(resource))
      : inflection.tableFieldName(resource);

    const insertedRowAlias = sql.identifier(Symbol());

    try {
      await client.query(sql.compile(sql`SAVEPOINT graphql_relation_mutation`));

      const tableInput = input[tableFieldName] as Record<string, unknown>;

      const forwardOutput = await recurseForwardMutations(
        parent,
        {input: tableInput},
        client
      );

      const inputData = Object.assign({}, tableInput, forwardOutput);

      let mutationQuery: null | SQL = null;

      if (isUpdateField) {
        mutationQuery = updateOne(build, resource, {input: inputData});
      } else {
        // isPgCreateField
        mutationQuery = insertOne(build, resource, {input: inputData});
      }

      const {rows} = await client.query(sql.compile(mutationQuery));
      const row = rows[0];

      const nestedFields = build.pgRelationInputsFields[resource.name] ?? [];

      await Promise.all(
        Object.entries(inputData).map(async ([key, val]) => {
          const nestedField = nestedFields.find((f) => f.fieldName === key);
          if (!nestedField || !val) return;

          const {fieldName, typeName, relationName, mode, method, unique} =
            nestedField;

          const relationField = (
            build.pgRelationInputsTypes[resource.name] ?? []
          ).find((r) => r.relationName === relationName);

          if (!relationField) {
            throw new Error('No relation field found');
          }
          const {remoteResource, matchedAttributes, isReferencee, isUnique} =
            relationField;
          const foreignTableUniq = remoteResource.uniques.find(
            (u) => u.isPrimary
          );
          const primaryKeys = foreignTableUniq
            ? foreignTableUniq.attributes
            : null;

          if (isUnique && Object.keys(val).length > 1) {
            throw new Error(
              'Unique relations may only create or connect a single row'
            );
          }
          // perform nested connects

          // perform nested disconnects

          // perform nested deletes

          // perform nested updates
        })
      );
    } catch (e) {
      await client.query(
        sql.compile(sql`ROLLBACK TO SAVEPOINT graphql_relation_mutation`)
      );
      throw e;
    } finally {
      await client.query(
        sql.compile(sql`RELEASE SAVEPOINT graphql_relation_mutation`)
      );
    }

    return {};
  }

  return ($parent, args) => {
    const $data = list([$parent, args.getRaw()]);
    return withPgClientTransaction(
      resource.executor,
      $data,
      async (client, data) => {
        return await mutationResolver(data[0], {input: data[1]}, client);
      }
    );
  };
}
