import type {GetPgResourceAttributes, PgCodec} from 'postgraphile/@dataplan/pg';
import {
  ExecutableStep,
  type ExecutionDetails,
  type GrafastResultsList,
  type PromiseOrDirect,
  type SetterStep,
  setter,
} from 'postgraphile/grafast';
import type {SQL} from 'postgraphile/pg-sql2';
import type {PgRelationInputData} from '../interfaces.ts';
export class PgSqlGeneratorStep<
  TRelationship extends PgRelationInputData,
> extends ExecutableStep<SQL> {
  static $$export = {
    moduleName: '@litewarp/graphile-relation-inputs',
    exportName: 'PgSqlGeneratorStep',
  };

  private contextId: number;

  private locked = false;

  private _relationship: TRelationship;

  private attributes: Array<{
    name: keyof GetPgResourceAttributes<TRelationship['remoteResource']>;
    depId: number;
    pgCodec: PgCodec;
  }> = [];

  constructor(relationship: TRelationship) {
    super();
    this._relationship = relationship;
    this.contextId = this.addDependency(
      relationship.remoteResource.executor.context()
    );
  }

  set(name: string, value: ExecutableStep): void {
    if (this.locked) {
      throw new Error('Cannot set value on locked step');
    }
    const depId = this.addDependency(value);
    const attribute = this._relationship.remoteResource.codec.attributes[name];
    if (!attribute) {
      console.warn(
        `Attribute ${name} not found on ${this._relationship.remoteResource.name}`
      );
    } else {
      this.attributes.push({name, depId, pgCodec: attribute.codec});
    }
  }

  setPlan(): SetterStep<Record<string, ExecutableStep>, this> {
    if (this.locked) {
      throw new Error('Cannot set value on locked step');
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
        console.log(attribute, value[attribute.depId]);
      }
      // reorder leaves
    });
  }
}

export function pgSqlGeneratorStep<TRelationship extends PgRelationInputData>(
  relationship: TRelationship
): PgSqlGeneratorStep<TRelationship> {
  return new PgSqlGeneratorStep(relationship);
}
