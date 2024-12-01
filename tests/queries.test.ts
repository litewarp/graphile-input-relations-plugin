import {existsSync, readdirSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {makePgService} from '@dataplan/pg/adaptors/pg';
import {PgSimplifyInflectionPreset} from '@graphile/simplify-inflection';
import type {SchemaResult} from 'graphile-build';
import {makeSchema} from 'graphile-build';
import type {ExecutionArgs} from 'graphql';
import {parse, validate} from 'graphql';
import type {Pool} from 'pg';
import {makeWithPgClientViaPgClientAlreadyInTransaction} from 'postgraphile/adaptors/pg';
import {execute, hookArgs} from 'postgraphile/grafast';
import {PostGraphileAmberPreset} from 'postgraphile/presets/amber';
import {RelationshipMutationsPreset} from '../src/index.ts';
import {withPgClient, withPgPool} from './helpers.ts';
import {printOrderedSchema} from './print-ordered-schema.ts';

const readFixtureForSqlSchema = async (sqlSchema: string, fixture: string) =>
  readFile(
    path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries', fixture),
    'utf8'
  );

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
  await writeFile(`./tmp/${sqlSchema}.graphql`, printOrderedSchema(gs.schema), 'utf8');
  return gs;
};

const getFixturesForSqlSchema = (sqlSchema: string) =>
  existsSync(path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries'))
    ? readdirSync(
        path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries')
      ).sort()
    : [];

const getSqlSchemas = () => readdirSync(path.resolve(__dirname, 'schemas')).sort();

const sqlSchemas = getSqlSchemas();

let gqlSchema: SchemaResult;

beforeAll(async () => {
  // Ensure process.env.TEST_DATABASE_URL is set
  if (!process.env.TEST_DATABASE_URL) {
    console.error(
      'ERROR: No test database configured; aborting. To resolve this, ensure environmental variable TEST_DATABASE_URL is set.'
    );
    process.exit(1);
  }
});

describe.each(sqlSchemas)('%s', (sqlSchema) => {
  beforeEach(async () => {
    // reset db
    await withPgClient(async (pgClient) => {
      const schema = await readFile(
        path.resolve(__dirname, 'schemas', sqlSchema, 'schema.sql'),
        'utf8'
      );
      await pgClient.query(schema);
      const data = await readFile(
        path.resolve(__dirname, 'schemas', sqlSchema, 'data.sql'),
        'utf8'
      );
      await pgClient.query(data);
    });

    gqlSchema = await withPgPool(async (pool) =>
      createPostGraphileSchema(pool, sqlSchema)
    );
  });
  const fixtures = getFixturesForSqlSchema(sqlSchema);
  if (fixtures.length > 0) {
    test.each(fixtures)('query=%s', async (fixture) => {
      const {schema, resolvedPreset} = gqlSchema;
      const query = await readFixtureForSqlSchema(sqlSchema, fixture);
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
      const result = await withPgClient(async (pgClient) => {
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
            pgSettings: (args.contextValue as any).pgSettings,
            withPgClient: contextWithPgClient,
          };
          return (await execute(args)) as any;
        } finally {
          await contextWithPgClient.release?.();
        }
      });
      if (result.errors) {
        console.log(result.errors.map((e: any) => e.originalError ?? e));
      }
      // console.log(JSON.stringify(result.data, null, 2));
      expect(result).toMatchSnapshot();
    });
  }
});
