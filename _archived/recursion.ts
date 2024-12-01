import {
  type PgClient,
  type PgInsertSingleStep,
  type PgUpdateSingleStep,
  withPgClient,
} from '@dataplan/pg';
import {__InputObjectStep} from 'postgraphile/grafast';
import {insertOne} from './generators/insert.ts';
import {type PgTableResource} from '../helpers.ts';

export function handleMutation(
  build: GraphileBuild.Build,
  resource: PgTableResource,
  $resource: PgInsertSingleStep | PgUpdateSingleStep,
  $args: __InputObjectStep
) {
  const {inflection, sql} = build;
  if (!($args instanceof __InputObjectStep)) {
    throw new Error('Mutation arguments must be an input object');
  }

  const recurseForwardInputs = async (
    resource: PgTableResource,
    parent: Record<string, unknown>,
    {input}: {input: Record<string, unknown>},
    client: PgClient
  ) => {
    const relationships = build.pgRelationshipInputTypes[resource.name];
    if (!relationships) return;
    const fowardRelations = relationships.filter(({isReferencee}) => !isReferencee);
    const output = Object.assign({}, input);

    await Promise.all(
      fowardRelations
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

          if (fieldValue.create) {
            const createData = fieldValue.create;
            const tableVar = inflection.tableFieldName(remoteResource);

            const insertData = Object.assign(
              {},
              createData,
              await recurseForwardInputs(
                remoteResource,
                {},
                {input: {[tableVar]: createData}},
                client
              )
            );
            const {data: row} = await recurseAll(
              remoteResource,
              {input: {[tableVar]: insertData}},
              client,
              'create'
            );

            remoteAttributes.map((attr, i) => {
              const key = localAttributes[i];
              if (key) {
                const inflectedName = inflection.attribute({
                  attributeName: key.name,
                  codec: localResource.codec,
                });
                output[inflectedName] = (row as Record<string, unknown>)[attr.name];
              }
            });
          }
        })
    );
    return output;
  };

  const recurseAll = async (
    resource: PgTableResource,
    {input}: {input: Record<string, unknown>},
    client: PgClient,
    mode: 'initial' | 'update' | 'create' = 'initial'
  ) => {
    const relationships = build.pgRelationshipInputTypes[resource.name];
    if (!relationships) return;

    // await client.query(sql.compile(sql`SAVEPOINT graphql_relationship_mutation`));

    try {
      // first build the initial resource object
      let row: Record<string, unknown> = {};
      if (mode === 'initial') {
        const name = resource.name;
        const symbol = Symbol(name);
        const alias = sql.identifier(symbol);
        const table = sql`${typeof resource.from === 'function' ? resource.from() : resource.from} as ${alias}`;
        const res = await client.query(sql.compile());
      } else if (mode === 'create') {
        // if create, insert one, return row
        const insertSql = insertOne(build, resource, {input});
        const res = await client.query(sql.compile(insertSql));
        row = res.rows[0] as Record<string, unknown>;
      } else if (mode === 'update') {
        // if update, update one, return row
      }
      const tableFieldName = inflection.tableFieldName(resource);
      const forwardOutput = await recurseForwardInputs(
        resource,
        {},
        {input: input[tableFieldName] as Record<string, unknown>},
        client
      );

      const inputData = Object.assign({}, input[tableFieldName], forwardOutput);

      await Promise.all(
        Object.entries(inputData).map(async ([key, value]) => {
          const nestedField = (build.pgRelationshipInputTypes[resource.name] ?? [])
            .filter((r) => r.isReferencee)
            .find((r) => inflection.relationshipInputFieldName(r) === key);

          if (!nestedField || !value) return;

          if ((value as Record<string, unknown>).create) {
          }

          await Promise.all(
            Object.entries(value).map(async ([k2, v2]) => {
              if (k2 === 'create') {
                // make sure an array
                const tableVar = inflection.tableFieldName(nestedField.remoteResource);
                await Promise.all(
                  v2.map(async (rowData) => {
                    const keyData = nestedField.remoteAttributes.reduce(
                      (acc, attr, i) => {
                        const localAttribute = nestedField.localAttributes[i];
                        if (localAttribute) {
                          const colName = inflection.attribute({
                            attributeName: attr.name,
                            codec: nestedField.remoteResource.codec,
                          });
                          return {...acc, [colName]: row[localAttribute.name]};
                        }
                        return acc;
                      },
                      {}
                    );
                    const insertData = Object.assign({}, rowData, keyData);
                    const {data: reverseRow} = await recurseAll(
                      nestedField.remoteResource,
                      {input: {[tableVar]: insertData}},
                      client,
                      'create'
                    );
                    const rowKeyValues: Record<string, unknown> = {};
                    if (primaryUnique) {
                      primaryUnique.attributes.forEach((attr) => {
                        rowKeyValues[attr] = reverseRow[attr];
                      });
                    }
                  })
                );
              }
            })
          );
        })
      );
      return {data: row};
    } catch (e) {
      console.log(e);
      // await client.query(
      //   sql.compile(sql`ROLLBACK TO SAVEPOINT graphql_relationship_mutation`)
      // );
      throw e;
    } finally {
      // await client.query(
      //   sql.compile(sql`RELEASE SAVEPOINT graphql_relationship_mutation`)
      // );
    }
  };

  const primaryUnique = resource.uniques?.find((u) => u.isPrimary);
  if (!primaryUnique) {
    throw new Error(
      `Resource ${resource.name} does not have a primary unique constraint or no registered relationship mutation inputs`
    );
  }

  return withPgClient(
    resource.executor,
    build.grafast.list([$resource, $args]),
    async (client, args) => {
      const [parent, input] = args;
      console.log(parent);
      const res = await recurseAll(resource, {input}, client);
      console.log(res);
      return res.data;
    }
  );
}
