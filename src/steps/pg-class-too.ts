import {
  PgClassExpressionStep,
  type PgClassSingleStep,
  type PgCodec,
  type PgTypedExecutableStep,
  type PgUnionAllSingleStep,
} from 'postgraphile/@dataplan/pg';
import {exportAs} from 'postgraphile/grafast';
import {type SQL, sql} from 'postgraphile/pg-sql2';
import type {PgTableResource} from '../interfaces.ts';

export class PgClassExpressionStepToo<
  TCodec extends PgCodec,
  TResource extends PgTableResource,
> extends PgClassExpressionStep<TCodec, TResource> {
  static $$export = {
    moduleName: '@litewarp/graphile-relation-inputs',
    exportName: 'PgClassExpressionStepToo',
  };

  private attrIndex: number | null = null;

  public rowDependencyId: number | null = null;

  constructor(
    table: PgUnionAllSingleStep | PgClassSingleStep<TResource>,
    codec: TCodec,
    strings: TemplateStringsArray,
    dependencies: ReadonlyArray<PgTypedExecutableStep<any> | SQL> = [],
    guaranteedNotNull?: boolean
  ) {
    super(table, codec, strings, dependencies, guaranteedNotNull);
  }

  public getParentStep(): PgUnionAllSingleStep | PgClassSingleStep<TResource> {
    // whitelist for now but ask benji if we can make pgclassexpression generic with some restrictions, type guards and differentiation from the other classExpressionSteps

    if (!this.rowDependencyId) {
      throw new Error('rowDependencyId is not set');
    }

    return this.getDep(this.rowDependencyId) as
      | PgUnionAllSingleStep
      | PgClassSingleStep<TResource>;
  }
  public optimize(): this {
    this.attrIndex = this.getParentStep().selectAndReturnIndex(
      this.pgCodec.castFromPg
        ? this.pgCodec.castFromPg(this.expression, this.guaranteedNotNull)
        : sql`${sql.parens(this.expression)}::text`
    );
    return this;
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
    const sqlExpr = pgClassExpressionToo(
      this.getParentStep(),
      attribute.codec,
      attribute.notNull
    );
    return sqlExpr`${sql.parens(this.expression, true)}.${sql.identifier(
      attributeName as string
    )}` as any;
  }
}

/**
 * This higher order function takes a table and codec as input and returns a
 * tagged template literal function that you can use to build an SQL expression
 * that will be selected.
 */
function pgClassExpressionToo<
  TExpressionCodec extends PgCodec,
  TResource extends PgTableResource,
>(
  table: PgUnionAllSingleStep | PgClassSingleStep<TResource>,
  codec: TExpressionCodec,
  guaranteedNotNull?: boolean
): (
  strings: TemplateStringsArray,
  ...dependencies: ReadonlyArray<PgTypedExecutableStep<any> | SQL>
) => PgClassExpressionStep<TExpressionCodec, TResource> {
  return (strings, ...dependencies) => {
    return new PgClassExpressionStepToo(
      table,
      codec,
      strings,
      dependencies,
      codec.notNull || guaranteedNotNull
    );
  };
}

exportAs(
  '@litewarp/graphile-relation-inputs',
  pgClassExpressionToo,
  'pgClassExpressionToo'
);

export {pgClassExpressionToo};
