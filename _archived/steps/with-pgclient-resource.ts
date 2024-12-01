import {type PgClient, type PgCodec, PgResource, type WithPgClient} from '@dataplan/pg';
import type {PgTableResource} from '@graphile-contrib/pg-many-to-many';
import {
  type AccessStep,
  ExecutableStep,
  type ExecutionExtra,
  type GrafastResultsList,
  type GrafastValuesList,
  type SetterCapableStep,
  type SetterStep,
  access,
  setter,
} from 'postgraphile/grafast';

type PgResourceAttributes<TResource extends PgTableResource> =
  keyof TResource['codec']['attributes'];

interface ContextValues {
  pgSettings: Record<string, string>;
  withPgClient: WithPgClient;
}

/**
 * Like WithPgClient but with a typed and tracked resource
 */
export class WithTypedResourcePgClientStep<
    TResource extends PgTableResource = PgTableResource,
    TData = any,
    TResult extends Record<PgResourceAttributes<TResource>, any> = Record<
      PgResourceAttributes<TResource>,
      any
    >,
  >
  extends ExecutableStep<TResult>
  implements SetterCapableStep<Record<PgResourceAttributes<TResource>, any>>
{
  static $$export = {
    moduleName: '@litewarp/graphile-nested-mutations',
    exportName: 'WithTypedResourcePgClientStep',
  };

  isSyncAndSafe = false;
  hasSideEffects = true;

  private locked = false;

  /**
   * The resource to be returned by the step
   */
  public readonly resource: TResource;

  /**
   * The id for the PostgreSQL context plan.
   */
  private contextId: number;

  /**
   * The id for the data plan.
   */
  private dataId: number;

  /**
   * Names of the attributes to be selected
   */
  private writeAttributes = new Map<
    PgResourceAttributes<TResource>,
    {name: string; depId: number; pgCodec: PgCodec}
  >();

  /**
   * Names of the attributes to be selected
   */
  private attributes = new Map<
    PgResourceAttributes<TResource>,
    {name: string; depId: null; pgCodec: PgCodec}
  >();

  constructor(
    resource: TResource,
    $data: ExecutableStep<TData>,
    private callback: (
      client: PgClient,
      data: TData,
      selections: {
        attributes: PgResourceAttributes<TResource>[];
        values: [PgResourceAttributes<TResource>, any][];
      }
    ) => Promise<TResult>
  ) {
    super();
    this.resource = resource;
    this.contextId = this.addDependency(this.resource.executor.context());
    this.dataId = this.addDependency($data);

    // add the primary key to the selection set if exists
    const primaryUnique = this.resource.uniques.find((u) => u.isPrimary);
    if (primaryUnique) {
      primaryUnique.attributes.forEach((attr) => {
        this._setAttribute(attr);
      });
    }
  }

  set(attr: PgResourceAttributes<TResource>, $step: ExecutableStep): void {
    this._setAttribute(attr, this.addDependency($step));
  }

  get(attr: PgResourceAttributes<TResource>): AccessStep<any> {
    this._setAttribute(attr);
    return access(this, attr);
  }

  execute(
    _count: number,
    values: GrafastValuesList<ContextValues | TData | TResult>[],
    _extra: ExecutionExtra
  ): GrafastResultsList<TResult> {
    const contexts = values[this.contextId] as ContextValues[];
    const datas = values[this.dataId] as TData[];

    return contexts.map(async ({pgSettings, withPgClient}, i) => {
      const data = datas[i] as TData;

      const setValues = [...this.writeAttributes.values()]
        .map(({name, depId}) => {
          const val = values[depId] && values[depId]?.[i];
          return val ? [name, val] : null;
        })
        .filter((v): v is [string, any] => v !== null);

      const $result = withPgClient(pgSettings, (client) =>
        this.callback(client, data, {
          values: setValues,
          attributes: [...this.attributes.keys()],
        })
      );
      return $result;
    });
  }

  setPlan(): SetterStep<Record<PgResourceAttributes<TResource>, any>, this> {
    if (this.locked) {
      throw new Error(`${this}: cannot set values once plan is locked ('setPlan')`);
    }
    return setter(this);
  }

  public finalize(): void {
    if (!this.isFinalized) {
      this.locked = true;

      super.finalize();
    }
  }

  private _setAttribute(
    attr: PgResourceAttributes<TResource>,
    depId?: number | null
  ): void {
    const attribute = Object.entries(this.resource.codec.attributes).find(
      ([name, _]) => name === attr
    );

    if (!attribute) {
      throw new Error(
        `${this.resource.name} does not define an attribute named '${String(attr)}'`
      );
    }

    const {via, codec} = attribute[1];

    if (via) {
      throw new Error(
        `Cannot set or select a 'via' attribute from WithTypedResourcePgClientStep`
      );
    }

    if (depId) {
      this.writeAttributes.set(attr, {
        name: attr.toString(),
        depId,
        pgCodec: codec,
      });
    } else {
      this.attributes.set(attr, {
        name: attr.toString(),
        depId: null,
        pgCodec: codec,
      });
    }
    // if we already have the attribute added, make sure
    // we aren't overwriting a depId related to a step
  }
}

export function withPgClientResource<
  TResource extends PgTableResource = PgTableResource,
  TData = any,
>(
  resource: TResource,
  $data: ExecutableStep,
  callback: (
    client: PgClient,
    data: TData,
    selections: {
      attributes: PgResourceAttributes<TResource>[];
      values: [PgResourceAttributes<TResource>, any][];
    }
  ) => Promise<Record<PgResourceAttributes<TResource>, any>>
): WithTypedResourcePgClientStep<TResource> {
  return new WithTypedResourcePgClientStep(resource, $data, (client, data, selections) =>
    callback(client, data, selections)
  );
}
