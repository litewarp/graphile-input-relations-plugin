import {
  type GetPgResourceAttributes,
  type GetPgResourceCodec,
  type GetPgResourceRelations,
  type PgClassExpressionStep,
  type PgCodecRelation,
  type PgCodecWithAttributes,
  pgClassExpression,
} from 'postgraphile/@dataplan/pg';
import {
  ExecutableStep,
  type ExecutionDetails,
  type GrafastResultsList,
  type PromiseOrDirect,
  type SetterCapableStep,
  type SetterStep,
  setter,
} from 'postgraphile/grafast';
import {$$toSQL, type SQL, type SQLable, sql} from 'postgraphile/pg-sql2';
import {inspect} from '../inspect.ts';
import type {PgTableResource} from '../interfaces.ts';
import {isPgTableResource} from '../utils/resource.ts';

export class PgInsertSingleWithRelationInputsStep<
    TResource extends PgTableResource = PgTableResource,
  >
  extends ExecutableStep<unknown[]>
  implements SetterCapableStep<Record<string, ExecutableStep>>, SQLable
{
  static $$export = {
    moduleName: '@litewarp/graphile-relation-inputs',
    exportName: 'InsertSingleWithRelationInputsStep',
  };

  isSyncAndSafe = false;

  public readonly resource: TResource;

  private readonly name: string;

  private readonly symbol: symbol | string;

  public readonly alias: SQL;

  private contextId: number;

  private locked = false;

  private _allFields: Array<
    PgCodecRelation<PgCodecWithAttributes, PgTableResource> & {
      relationName: string;
    }
  > = [];

  private selects: Array<SQL> = [];

  private attributes: Array<{
    name:
      | keyof GetPgResourceAttributes<TResource>
      | keyof GetPgResourceRelations<TResource>;
    depId: number;
    pgCodec?: PgCodecWithAttributes | PgTableResource['codec'];
  }> = [];

  constructor(resource: TResource) {
    super();
    this.hasSideEffects = true;
    this.resource = resource;
    this.name = resource.name;
    this.symbol = Symbol(this.name);
    this.alias = sql.identifier(this.symbol);
    this.contextId = this.addDependency(this.resource.executor.context());

    const relationships = Object.values(
      this.resource.registry.pgResources
    ).reduce(
      (memo, resource) => {
        if (!isPgTableResource(resource)) {
          return memo;
        }
        const rels = resource.getRelations();

        for (const [relationName, rel] of Object.entries(rels)) {
          memo.push({relationName, ...rel});
        }
        return memo;
      },
      [] as Array<
        PgCodecRelation<PgCodecWithAttributes, PgTableResource> & {
          relationName: string;
        }
      >
    );

    for (const relationship of relationships) {
      this._allFields.push(relationship);
    }
  }

  private _isValidPath(name: string): boolean {
    return Boolean(
      this._allFields.find(({relationName}) => relationName === name)
    );
  }

  get<TAttr extends keyof GetPgResourceAttributes<TResource>>(
    attr: TAttr & string
  ): ExecutableStep {
    if (!this.resource.codec.attributes) {
      throw new Error('Cannot call .get() when there are no attributes');
    }
    const resourceAttribute = this.resource.codec.attributes[attr];

    if (!resourceAttribute) {
      throw new Error(
        `${this.resource} does not define an attribute named '${String(attr)}'`
      );
    }

    if (resourceAttribute?.via) {
      throw new Error(
        `Cannot select a 'via' attribute from PgInsertSingleWithRelationInputsStep`
      );
    }
    /*
     * Only cast to `::text` during select; we want to use it uncasted in
     * conditions/etc. The reasons we cast to ::text include:
     *
     * - to make return values consistent whether they're direct or in nested
     *   arrays
     * - to make sure that that various PostgreSQL clients we support do not
     *   mangle the data in unexpected ways - we take responsibility for
     *   decoding these string values.
     */

    const sqlExpr = pgClassExpression(
      this,
      resourceAttribute.codec,
      resourceAttribute.notNull
    );
    const colPlan = resourceAttribute.expression
      ? sqlExpr`${sql.parens(resourceAttribute.expression(this.alias))}`
      : sqlExpr`${this.alias}.${sql.identifier(String(attr))}`;
    return colPlan as any;
  }

  public record(): PgClassExpressionStep<
    GetPgResourceCodec<TResource>,
    TResource
  > {
    return pgClassExpression<GetPgResourceCodec<TResource>, TResource>(
      this,
      this.resource.codec as GetPgResourceCodec<TResource>,
      false
    )`${this.alias}`;
  }

  paths: string[] = [];

  set(name: string, value: ExecutableStep): void {
    if (this.locked) {
      throw new Error('Cannot set after lock');
    }
    const depId = this.addDependency(value);

    if (this._isValidPath(name)) {
      this.attributes.push({name, depId});
    } else {
      this.attributes.push({name, depId});
    }
  }

  setPlan(): SetterStep<Record<string, ExecutableStep>, this> {
    if (this.locked) {
      throw new Error("Cannot set after lock ('setPlan')");
    }
    return setter(this);
  }

  async execute({
    indexMap,
    values,
  }: ExecutionDetails): Promise<GrafastResultsList<unknown>> {
    return indexMap<PromiseOrDirect<unknown>>((i) => {
      const value = values.map((v) => v.at(i));

      const _context = value[this.contextId];

      for (const attribute of this.attributes.toReversed()) {
        console.log('rooooot', attribute, value[attribute.depId]);
      }
      // reorder leaves
    });
  }

  public selectAndReturnIndex(fragment: SQL): number {
    // NOTE: it's okay to add selections after the plan is "locked" - lock only
    // applies to which rows are being selected, not what is being queried
    // about the rows.

    // Optimisation: if we're already selecting this fragment, return the existing one.
    const index = this.selects.findIndex((frag) =>
      sql.isEquivalent(frag, fragment)
    );
    if (index >= 0) {
      return index;
    }

    return this.selects.push(fragment) - 1;
  }

  public finalize(): void {
    if (!this.isFinalized) {
      this.locked = true;
      const resourceSource = this.resource.from;
      if (!sql.isSQL(resourceSource)) {
        throw new Error(
          `Error in ${this}: can only insert into sources defined as SQL, however ${this.resource} has ${inspect(
            this.resource.from
          )}`
        );
      }

      const table = sql`${resourceSource} as ${this.alias}`;

      const fragmentsWithAliases = this.selects.map(
        (frag, idx) => sql`${frag} as ${sql.identifier(String(idx))}`
      );
      const returning =
        fragmentsWithAliases.length > 0
          ? sql` returning\n${sql.indent(
              sql.join(fragmentsWithAliases, ',\n')
            )}`
          : sql.blank;
    }
    super.finalize();
  }
  [$$toSQL]() {
    return this.alias;
  }
}

export function pgInsertSingleWithRelationInputsStep<
  TResource extends PgTableResource,
>(resource: TResource) {
  return new PgInsertSingleWithRelationInputsStep(resource);
}
