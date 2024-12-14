import type {UnbatchedExecutionExtra} from 'grafast';
import {UnbatchedExecutableStep, access, exportAs} from 'grafast';
import type {SQL} from 'pg-sql2';
import {$$toSQL, sql} from 'pg-sql2';

import type {
  GetPgCodecAttributes,
  PgCodec,
  PgResource,
  PgTypedExecutableStep,
} from 'postgraphile/@dataplan/pg';
import type {PgTableResource} from '../interfaces.ts';
import {PgInsertSingleWithRelationInputsStep} from './the-step.ts';

// const debugPlan = debugFactory("@dataplan/pg:PgClassExpressionStep:plan");
// const debugExecute = debugFactory( "@dataplan/pg:PgClassExpressionStep:execute",);
// const debugPlanVerbose = debugPlan.extend("verbose");
// const debugExecuteVerbose = debugExecute.extend("verbose");

/**
 * A plan for selecting a attribute or attribute-like expression. Keep in mind that
 * a attribute might not be a scalar (could be a list, compound type, JSON,
 * geometry, etc), so this might not be a "leaf". The result of this might be used as the input
 * of another layer of plan.
 */
export class PgClassExpressionStep<
    TExpressionCodec extends PgCodec,
    TResource extends PgTableResource,
  >
  extends UnbatchedExecutableStep<any>
  implements PgTypedExecutableStep<TExpressionCodec>
{
  static $$export = {
    moduleName: '@litewarp/graphile-relation-inputs',
    exportName: 'PgClassExpressionUnlockedStep',
  };

  isSyncAndSafe = true;

  /**
   * The dependency id of the parent table row (from SELECT,
   * INSERT...RETURNING, etc).
   *
   * @internal
   */
  public readonly rowDependencyId: number;

  /**
   * This is the numeric index of this expression within the grandparent
   * PgSelectStep's selection.
   */
  private attrIndex: number | null = null;

  public readonly expression: SQL;

  constructor(
    $table: PgInsertSingleWithRelationInputsStep<TResource>,
    public readonly pgCodec: TExpressionCodec,
    strings: TemplateStringsArray,
    dependencies: ReadonlyArray<PgTypedExecutableStep<any> | SQL> = [],
    private guaranteedNotNull?: boolean
  ) {
    super();

    this.rowDependencyId = this.addDependency($table);
    if (strings.length !== dependencies.length + 1) {
      throw new Error(
        `Invalid call to PgClassExpressionStep; should have exactly one more string (found ${strings.length}) than dependency (found ${dependencies.length}). Recommend using the tagged template literal helper pgClassExpression.`
      );
    }
    const badStringIndex = strings.findIndex((s) => typeof s !== 'string');
    if (badStringIndex >= 0) {
      throw new Error(
        `Received a non-string at index ${badStringIndex} to strings argument of ${this}.`
      );
    }

    const fragments: SQL[] = dependencies.map((stepOrSql, i) => {
      if (!stepOrSql) {
        throw new Error(`Invalid stepOrSql at index ${i}`);
      }
      if (sql.isSQL(stepOrSql)) {
        return stepOrSql;
      } else if (
        stepOrSql instanceof PgClassExpressionStep &&
        stepOrSql.getParentStep() === $table
      ) {
        // TODO: when we defer placeholders until finalize we'll need to copy
        // deps/etc
        return stepOrSql.expression;
      } else if ($table instanceof PgSelectSingleStep) {
        // TODO: when we defer placeholders until finalize we'll need to store
        // deps/etc
        const placeholder = $table.placeholder(stepOrSql);
        return placeholder;
      } else {
        throw new Error(
          `Cannot use placeholders when parent plan is ${$table}`
        );
      }
    });

    // We're pretending we called `sql` directly by passing the template
    // strings array.
    this.expression = sql(strings, ...fragments);
  }

  public toStringMeta(): string {
    if (!this.expression) {
      return '???';
    }
    const expr = sql.compile(this.expression);
    if (expr.text.length > 23) {
      return (
        expr.text.slice(0, 10) + '...' + expr.text.slice(expr.text.length - 10)
      );
    } else {
      return expr.text;
    }
  }

  /* Here's the proper type of this function, but that makes using it painful.
    ```ts
    public get<
      TAttr extends TExpressionCodec extends PgCodec<
        any,
        undefined,
        infer U,
        any,
        any,
        any,
        any
      >
        ? keyof U
        : keyof GetPgCodecAttributes<TExpressionCodec>,
    >(
      attributeName: TAttr,
    ): TExpressionCodec extends PgCodec<
      any,
      undefined,
      infer U,
      any,
      any,
      any,
      any
    >
      ? AccessStep<U>
      : PgClassExpressionStep<
          GetPgCodecAttributes<TExpressionCodec>[TAttr]["codec"],
          TResource
        > {
    ```

    Instead, we'll lie and ignore the `AccessStep` case
  */
  public get<TAttr extends keyof GetPgCodecAttributes<TExpressionCodec>>(
    attributeName: TAttr
  ): PgClassExpressionStep<
    GetPgCodecAttributes<TExpressionCodec>[TAttr]['codec'],
    TResource
  > {
    return this._getInternal(attributeName);
  }

  private _getInternal<
    TAttr extends keyof GetPgCodecAttributes<TExpressionCodec>,
  >(
    attributeName: TAttr
  ): PgClassExpressionStep<
    GetPgCodecAttributes<TExpressionCodec>[TAttr]['codec'],
    TResource
  > {
    const attributes = this.pgCodec.attributes;
    if (attributes === undefined) {
      // Fall back to access, since this could be a 'point' or similar type that doesn't have attributes in Postgres but does in JS.
      return access(this, attributeName) as any;
    }
    const attribute = attributes[attributeName as string];
    if (!attribute) {
      throw new Error(
        `Cannot call ${this}.get('${String(
          attributeName
        )}') because this does not have that attribute; supported attributes: '${Object.keys(
          attributes
        ).join("', '")}'.`
      );
    }
    if (attribute.via) {
      throw new Error(
        `Cannot call ${this}.get('${String(
          attributeName
        )}') because 'via' is not yet supported here - please raise an issue (or, even better, a pull request!).`
      );
    }
    if (attribute.expression) {
      throw new Error(
        `Cannot call ${this}.get('${String(
          attributeName
        )}') because 'expression' is not yet supported here - please raise an issue (or, even better, a pull request!).`
      );
    }
    const sqlExpr = pgClassExpression(
      this.getParentStep(),
      attribute.codec,
      attribute.notNull
    );
    return sqlExpr`${sql.parens(this.expression, true)}.${sql.identifier(
      attributeName as string
    )}` as any;
  }

  public getParentStep(): PgInsertSingleWithRelationInputsStep<TResource> {
    const step = this.getDep(this.rowDependencyId);
    if (!(step instanceof PgInsertSingleWithRelationInputsStep)) {
      throw new Error(
        `Expected ${step} to be a PgInsertSingleWithRelationInputsStep`
      );
    }
    return step;
  }

  public optimize(): this {
    this.attrIndex = this.getParentStep().selectAndReturnIndex(
      this.pgCodec.castFromPg
        ? this.pgCodec.castFromPg(this.expression, this.guaranteedNotNull)
        : sql`${sql.parens(this.expression)}::text`
    );
    return this;
  }

  public unbatchedExecute(_extra: UnbatchedExecutionExtra, v: any): any {
    if (v == null) {
      return null;
    }
    const rawValue = v[this.attrIndex!];
    if (rawValue == null) {
      return null;
    } else {
      return this.pgCodec.fromPg(rawValue);
    }
  }

  public [$$toSQL](): SQL {
    return this.expression;
  }

  public toSQL(): SQL {
    return this.expression;
  }
}

/**
 * This higher order function takes a table and codec as input and returns a
 * tagged template literal function that you can use to build an SQL expression
 * that will be selected.
 */
function pgClassExpression<
  TExpressionCodec extends PgCodec,
  TResource extends PgResource<any, any, any, any, any>,
>(
  table: PgInsertSingleWithRelationInputsStep<TResource>,
  codec: TExpressionCodec,
  guaranteedNotNull?: boolean
): (
  strings: TemplateStringsArray,
  ...dependencies: ReadonlyArray<PgTypedExecutableStep<any> | SQL>
) => PgClassExpressionStep<TExpressionCodec, TResource> {
  return (strings, ...dependencies) => {
    return new PgClassExpressionStep(
      table,
      codec,
      strings,
      dependencies,
      codec.notNull || guaranteedNotNull
    );
  };
}

exportAs('@dataplan/pg', pgClassExpression, 'pgClassExpression');

export {pgClassExpression};
