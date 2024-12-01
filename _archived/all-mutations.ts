import {type GetPgCodecAttributes, type PgClient, withPgClient} from '@dataplan/pg';
import {type ExecutableStep, __InputObjectStep} from 'postgraphile/grafast';
import type {} from 'postgraphile/pg-sql2';
import {insertOne} from './generators/insert.ts';
import type {PgTableResource} from '../helpers.ts';

export function handleMutation<
  TResource extends PgTableResource,
  TKeys extends keyof GetPgCodecAttributes<TResource['codec']>,
>(
  build: GraphileBuild.Build,
  resource: TResource,
  $args: __InputObjectStep
): ExecutableStep<Partial<Record<TKeys, unknown>>> {
  const {
    inflection,
    grafast: {list, object},
    sql,
    pgRelationshipInputTypes,
    pgRelationshipConnectorFields,
  } = build;

  // if (!($result instanceof PgInsertSingleStep || $result instanceof PgUpdateSingleStep)) {
  //   throw new Error(`$result must be a PgInsertSingleStep or PgUpdateSingleStep`);
  // }
  if (!($args instanceof __InputObjectStep)) {
    throw new Error(`$args must be an ObjectStep`);
  }

  const primaryUnique = resource.uniques?.find((u) => u.isPrimary);
  const inputTypes = pgRelationshipInputTypes[resource.name];

  if (!primaryUnique || !inputTypes) {
    throw new Error(
      `Resource ${resource.name} does not have a primary unique constraint or no registered relationship mutation inputs`
    );
  }

  const recurseForwardMutations = async (
    data: Record<string, unknown>,
    {input}: {input: Record<string, unknown>},
    client: PgClient
  ) => {
    const nestedFields = (pgRelationshipInputTypes[resource.name] ?? []).filter(
      ({isReferencee}) => !isReferencee
    );
    const output = Object.assign({}, input);
    await Promise.all(
      nestedFields
        .filter((r) => input[r.fieldName])
        .map(async (r) => {
          const {
            localAttributes,
            remoteAttributes,
            fieldName,
            remoteResource,
            localResource,
          } = r;
          const fieldValue = input[fieldName] as Record<string, unknown>;

          if (!fieldValue || typeof fieldValue !== 'object') return;

          const fieldNames = Object.keys(fieldValue);

          const connectorFieldNames = (
            pgRelationshipConnectorFields[resource.name] ?? []
          ).map(({fieldName}) => fieldName);

          if (connectorFieldNames.some((n) => fieldNames.includes(n))) {
            // do something
          }

          if (fieldValue.create) {
            const createData = fieldValue.create;
            const tableVar = inflection.tableFieldName(remoteResource);

            const insertData = Object.assign(
              {},
              createData,
              await recurseForwardMutations(
                data,
                {
                  input: {
                    [tableVar]: createData,
                  },
                },
                client
              )
            );
            const sql = insertOne(build, remoteResource, {
              input: {[tableVar]: insertData},
            });
            const res = await client.query(build.sql.compile(sql));
            const row = res.rows[0] as Record<string, unknown>;

            const circularForSure = await mutationResolver(
              data,
              {input: {[tableVar]: insertData}},
              client
            );
            console.log(circularForSure);

            remoteAttributes.forEach((attr, i) => {
              const key = localAttributes[i];
              if (!key) return;
              const inflectedName = inflection.attribute({
                attributeName: key.name,
                codec: localResource.codec,
              });
              output[inflectedName] = row[attr.name];
            });
          }
        })
    );
    return output;
  };

  const mutationResolver = async (
    data: Record<string, unknown>,
    {input}: {input: Record<string, unknown>},
    _client: PgClient
  ) => {
    const umm: Record<string, unknown> = {};
    _client.withTransaction(async (client) => {
      await client.query(sql.compile(sql`SAVEPOINT graphql_relationship_mutation`));

      const tableFieldName = inflection.tableFieldName(resource);
      const forwardOutput = await recurseForwardMutations({}, {input}, client);

      try {
        // extract the foreign keys
        inputTypes.forEach(({localAttributes}) => {
          localAttributes.forEach((attr) => {
            const fieldName = inflection.attribute({
              attributeName: attr.name,
              codec: resource.codec,
            });
            const value = forwardOutput[fieldName];
            if (value) {
              umm[attr.name] = value;
            }
          });
        });

        const inputData = Object.assign({}, input[tableFieldName], forwardOutput);

        Object.entries(inputData).forEach(([key, value]) => {
          const nestedField = inputTypes
            .filter((r) => r.isReferencee)
            .find((r) => inflection.relationshipInputFieldName(r) === key);

          console.log(key, value, nestedField);

          if (!nestedField || !value) return;
        });
      } catch (e) {
        console.error(e);
        await client.query(
          sql.compile(sql`ROLLBACK TO SAVEPOINT graphql_relationship_mutation`)
        );
      } finally {
        await client.query(
          sql.compile(sql`RELEASE SAVEPOINT graphql_relationship_mutation`)
        );
      }
    });
    return umm;
  };

  // const $input = object(
  //   primaryUnique.attributes.reduce((memo, attr) => {
  //     return {...memo, [attr]: $result.get(attr)};
  //   }, {})
  // );

  return withPgClient(resource.executor, $args, async (client, args) => {
    const result = await mutationResolver({}, {input: args}, client);
    return result;
  });
}

const _collectPaths = (
  obj: Record<string, unknown>,
  currentPath: string[] = []
): string[] => {
  let paths: string[] = [];

  for (const key in obj) {
    const newPath = [...currentPath, key];

    if (typeof obj[key] === 'object' && !!obj[key]) {
      const innerObj = obj[key] as Record<string, unknown>;
      paths = paths.concat(_collectPaths(innerObj, newPath));
    } else {
      paths.push(newPath.join('.'));
    }
  }

  return paths;
};
