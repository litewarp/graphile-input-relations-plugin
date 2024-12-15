import type {GetPgResourceAttributes} from 'postgraphile/@dataplan/pg';
import {
  ExecutableStep,
  type ExecutionDetails,
  type GrafastResultsList,
  type PromiseOrDirect,
  type SetterCapableStep,
  type SetterStep,
  type UnbatchedExecutionExtra,
  type __InputObjectStep,
  access,
  setter,
} from 'postgraphile/grafast';
import {$$toSQL, type SQL, type SQLable, sql} from 'postgraphile/pg-sql2';
import {inspect} from '../inspect.ts';
import type {PgTableResource} from '../interfaces.ts';

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

  private argId: number;

  private locked = false;

  private relationInputs: {
    relationName: string;
    depId: number;
    path: string;
  }[] = [];

  private selects: Array<SQL> = [];

  constructor(resource: TResource, $object: __InputObjectStep) {
    super();
    this.hasSideEffects = true;
    this.resource = resource;
    this.name = resource.name;
    this.symbol = Symbol(this.name);
    this.alias = sql.identifier(this.symbol);
    this.contextId = this.addDependency(this.resource.executor.context());
    this.argId = this.addDependency($object);
  }

  get<TAttr extends keyof GetPgResourceAttributes<TResource>>(
    attribute: TAttr & string
  ): ExecutableStep {
    if (!this.resource.codec.attributes) {
      throw new Error('Cannot call .get() when there are no attributes');
    }
    const resourceAttribute = this.resource.codec.attributes[attribute];

    if (!resourceAttribute) {
      throw new Error(
        `${this.resource} does not define an attribute named '${String(attribute)}'`
      );
    }

    if (resourceAttribute?.via) {
      throw new Error(
        `Cannot select a 'via' attribute from PgInsertSingleWithRelationInputsStep`
      );
    }
    return access(this, attribute);
  }

  set(path: string, value: ExecutableStep): void {
    if (this.locked) {
      throw new Error('Cannot set after lock');
    }
    const relationName = path.split('.').pop() ?? '';
    const depId = this.addDependency(value);

    this.relationInputs.push({relationName, depId, path});
  }

  setPlan(): SetterStep<Record<string, ExecutableStep>, this> {
    if (this.locked) {
      throw new Error("Cannot set after lock ('setPlan')");
    }
    return setter(this);
  }

  unbatchedExecute = (extra: UnbatchedExecutionExtra, ...values: unknown[]) => {
    console.log(extra, values);
    return values;
  };

  async execute({
    indexMap,
    values,
  }: ExecutionDetails): Promise<GrafastResultsList<unknown>> {
    return indexMap<PromiseOrDirect<unknown>>(async (i) => {
      const value = values.map((v) => v.at(i));

      const rawArgs = value[this.argId];
      const context = value[this.contextId];

      console.log(rawArgs);
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
          `Error in ${this}: can only insert into sources defined as SQL, however ${
            this.resource
          } has ${inspect(this.resource.from)}`
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
>(resource: TResource, $object: __InputObjectStep) {
  return new PgInsertSingleWithRelationInputsStep(resource, $object);
}
