// https://github.com/graphile/crystal/blob/main/grafast/dataplan-pg/__tests__/sharedHelpers.ts

import type {PgClientQuery, WithPgClient} from '@dataplan/pg';
import type {Pool} from 'pg';
import {Client} from 'pg';
import {createWithPgClient} from 'postgraphile/adaptors/pg';

function noop() {}

/**
 * For the tests we want to ensure that `withPgClient` calls hang waiting for
 * the previous to complete - this allows our snapshots to be in a consistent
 * predictable order. You would not want this in production!
 */
function queuedWPC(withPgClient: WithPgClient): WithPgClient {
  let queue: Promise<void> | null;
  return (pgSettings, callback) => {
    const result = queue
      ? queue.then(() => withPgClient(pgSettings, callback))
      : withPgClient(pgSettings, callback);
    const nextQueue = result.then(noop, noop);
    queue = nextQueue;
    queue.then(() => {
      if (queue === nextQueue) {
        queue = null;
      }
    });
    return result;
  };
}

/**
 * Make a test "withPgClient" that writes queries issued into the passed
 * 'queries' array.
 *
 * Manages transactions automatically - if pgSettings are supplied then the
 * entire thing will be wrapped in a transaction and calls to withTransaction
 * will trigger a savepoint, otherwise no transaction is required initially and
 * withTransaction will simply issue 'BEGIN'.
 *
 * If !direct then everything will be wrapped in transactions and savepoints so
 * that it can be rolled back at the end.
 */
export async function withTestWithPgClient<T>(
  testPool: Pool,
  queries: PgClientQuery[],
  direct: boolean,
  callback: (withPgClient: WithPgClient) => Promise<T>
): Promise<T> {
  const poolClient = await testPool.connect();
  const oldQuery = poolClient.query;
  // @ts-expect-error tuples ugh
  poolClient.query = function (...args: Parameters<Client['query']>) {
    const opts = typeof args[0] === 'string' ? {text: args[0]} : args[0];
    if (!opts.text.includes('--ignore--')) {
      if (direct) {
        queries.push(opts);
      } else {
        // Because we're wrapping everything in a transaction already, we need
        // to "pretend" for the SQL snapshots that this was actually
        // begin/commit/rollback.
        switch (opts.text) {
          case 'savepoint tx': {
            queries.push({text: 'begin; /*fake*/'});
            break;
          }
          case 'release savepoint tx': {
            queries.push({text: 'commit; /*fake*/'});
            break;
          }
          case 'rollback to savepoint tx': {
            queries.push({text: 'rollback; /*fake*/'});
            break;
          }
          default: {
            queries.push(opts);
          }
        }
      }
    }
    return oldQuery.apply(this, args);
  };

  try {
    if (direct) {
      const withPgClient = createWithPgClient({
        poolClient,
      });
      return await callback(queuedWPC(withPgClient));
    } else {
      await poolClient.query('begin; --ignore--');
      let alive = true;
      try {
        const withPgClient = createWithPgClient({
          poolClient,
          poolClientIsInTransaction: true,
        });
        // Because we're already in a transaction, to pretend that we're _not_
        // in a transaction we actually have to create a sub-transaction so
        // that a statement failure can automatically rollback as if we weren't
        // in a transaction...
        const withPgClientWithSavepoints: WithPgClient = async (pgSettings, callback) => {
          if (!alive) {
            throw new Error(
              "Test transaction has already been ended - async operations shouldn't keep happening after grafast returns"
            );
          }
          // No transaction here; honest, gov!
          await poolClient.query('savepoint notxhonest; --ignore--');
          let result: any;
          try {
            result = await withPgClient(pgSettings, callback);
          } catch (e) {
            if (alive) {
              try {
                await poolClient.query('rollback to savepoint notxhonest; --ignore--');
              } catch (e2) {
                console.error(
                  `Error occurred releasing 'notxhonest' savepoint in tests`,
                  e2
                );
              }
            }
            throw e;
          }
          if (!alive) {
            throw new Error(
              "Test transaction has already been ended - async operations shouldn't keep happening after grafast returns"
            );
          }
          await poolClient.query('release savepoint notxhonest; --ignore--');

          return result;
        };
        return await callback(queuedWPC(withPgClientWithSavepoints));
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 0));
        alive = false;
        await poolClient.query('rollback; --ignore--');
      }
    }
  } finally {
    poolClient.query = oldQuery;
    poolClient.release();
  }
}
