import {beforeAll, beforeEach, describe, expect, it} from 'bun:test';
import {existsSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PgSimplifyInflectionPreset} from '@graphile/simplify-inflection';
import {execute, hookArgs} from 'grafast';
import {type SchemaResult, makeSchema} from 'graphile-build';
import {type ExecutionArgs, type ExecutionResult, parse, validate} from 'graphql';
import type {Pool} from 'pg';
import {
  makePgService,
  makeWithPgClientViaPgClientAlreadyInTransaction,
} from 'postgraphile/adaptors/pg';
import {PostGraphileAmberPreset} from 'postgraphile/presets/amber';
import {RelationshipMutationsPreset} from '../src/index.ts';
import {withPgClient, withPgPool} from './helpers.ts';
import {printOrderedSchema} from './print-ordered-schema.ts';

const __dirname = import.meta.dir;
const schemasDir = resolve(__dirname, 'schemas');

const readTextFile = async (path: string) => {
  const file = Bun.file(path);
  return await file.text();
};

const getSchemaPath = (schema: string, file?: string) =>
  file ? resolve(schemasDir, schema, file) : resolve(schemasDir, schema);

const getFixturesDir = (schema: string) =>
  resolve(schemasDir, schema, 'fixtures', 'queries');

const getAllFixtures = (schema: string) =>
  existsSync(getFixturesDir(schema)) ? readdirSync(getFixturesDir(schema)).sort() : [];

const readSchema = async (schema: string, file?: string) =>
  readTextFile(getSchemaPath(schema, file));

const readFixture = async (schema: string, fixture: string) =>
  readTextFile(resolve(getFixturesDir(schema), fixture));

const getSqlSchemas = () => readdirSync(schemasDir).sort();

const createPostGraphileSchema = async (pgPool: Pool, sqlSchema: string) => {
  const gs = await makeSchema({
    extends: [
      PostGraphileAmberPreset,
      PgSimplifyInflectionPreset,
      RelationshipMutationsPreset,
    ],
    pgServices: [
      makePgService({
        pool: pgPool,
        schemas: [sqlSchema],
      }),
    ],
  });
  await Bun.write(`./.tmp/${sqlSchema}.graphql`, printOrderedSchema(gs.schema));
  return gs;
};

const sqlSchemas = getSqlSchemas();

beforeAll(() => {
  // Ensure process.env.TEST_DATABASE_URL is set
  if (!process.env['TEST_DATABASE_URL']) {
    console.error(
      'ERROR: No test database configured; aborting. To resolve this, ensure environmental variable TEST_DATABASE_URL is set.'
    );
    process.exit(1);
  }
});

for (const sqlSchema of sqlSchemas) {
  describe(sqlSchema, () => {
    let gqlSchema: SchemaResult;

    beforeEach(async () => {
      // reset the database
      await withPgClient(async (tx) => {
        await tx.query(await readSchema(sqlSchema, 'schema.sql'));
        await tx.query(await readSchema(sqlSchema, 'data.sql'));
      });
      gqlSchema = await withPgPool(async (pool) =>
        createPostGraphileSchema(pool, sqlSchema)
      );
    });
    const fixtures = getAllFixtures(sqlSchema);
    if (fixtures.length > 0) {
      for (const fixture of fixtures) {
        it(`query=${fixture}`, async () => {
          const {schema, resolvedPreset} = gqlSchema;
          const query = await readFixture(sqlSchema, fixture);
          const document = parse(query);

          const errors = validate(schema, document);
          if (errors.length > 0) {
            throw new Error(
              `GraphQL validation errors:\n${errors.map((e) => e.message).join('\n')}`
            );
          }
          const args: ExecutionArgs = {
            schema,
            document,
          };
          await hookArgs(args, resolvedPreset, {});
          const result = await withPgClient<ExecutionResult>(async (pgClient) => {
            // We must override the context because we didn't use a pool above and so
            // we need to add our own client
            // NOTE: the withPgClient needed on context is **VERY DIFFERENT** to our
            // withPgClient test helper. We should rename our test helper ;)

            const contextWithPgClient = makeWithPgClientViaPgClientAlreadyInTransaction(
              pgClient,
              false
            );

            try {
              args.contextValue = {
                pgSettings: (args.contextValue as {pgSettings: unknown}).pgSettings,
                withPgClient: contextWithPgClient,
              };
              return (await execute(args)) as Promise<ExecutionResult>;
            } finally {
              await contextWithPgClient.release?.();
            }
          });
          if (result.errors) {
            console.log(result.errors.map((e) => e.originalError ?? e));
          }
          // console.log(JSON.stringify(result.data, null, 2));

          expect(result).toMatchSnapshot();
        });
      }
    }
  });
}
