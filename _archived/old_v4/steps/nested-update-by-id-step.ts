import type {
  GetPgResourceAttributes,
  PgCodec,
  PgTypedExecutableStep,
} from '@dataplan/pg';
import type {PgTableResource} from '@graphile-contrib/pg-many-to-many';
import {
  ExecutableStep,
  type ExecutionExtra,
  type GrafastResultsList,
  type GrafastValuesList,
  type PromiseOrDirect,
  isDev,
} from 'postgraphile/grafast';
import {type SQL, sql} from 'postgraphile/pg-sql2';
import {inspect} from '../../../inspect.ts'
import type {PgNestedMutationRelationship} from '../../../interfaces.ts';

type PgNestedAttributeMap<TResource extends PgTableResource = PgTableResource> =
  {
    [key in keyof GetPgResourceAttributes<TResource> | 'patch']?:
      | PgTypedExecutableStep<GetPgResourceAttributes<TResource>[key]['codec']>
      | ExecutableStep;
  };

export class PgNestedMutationUpdateByIdStep<
  TNestedResource extends PgTableResource = PgTableResource,
> extends ExecutableStep {
  static $$export = {
    moduleName: 'postgraphile-plugin-nested-mutations',
    exportName: 'PgNestedMutationUpdateByIdStep',
  };

  isSyncAndSafe = false;
  hasSideEffects = true;

  private rightTable: PgTableResource;
  private relationName: string;

  private contextId: number;

  private locked = false;

  private attributes: {
    name: keyof GetPgResourceAttributes<TNestedResource> | 'patch';
    depId: number;
    pgCodec: PgCodec;
  }[] = [];

  constructor(
    rel: PgNestedMutationRelationship,
    args: PgNestedAttributeMap<TNestedResource>
  ) {
    super();
    this.rightTable = rel.rightTable;
    this.relationName = rel.relationName;
    this.contextId = this.addDependency(this.rightTable.executor.context());

    Object.entries(args).forEach(([key, value]) => {
      if (value) {
        this.set(key, value);
      }
    });
  }

  async execute(
    count: number,
    values: readonly GrafastValuesList<any>[],
    _extra: ExecutionExtra
  ): Promise<GrafastResultsList<any>> {
    const result: PromiseOrDirect<any>[] = [];

    const tableName = this.rightTable.name;
    const tableSymbol = Symbol(tableName);
    const tableAlias = sql.identifier(tableSymbol);
    const resourceSource = this.rightTable.from;

    if (!sql.isSQL(resourceSource)) {
      throw new Error(
        `Error in nested updateById field: can only update into resources defined as SQL, however ${tableName} has ${inspect(resourceSource)}`
      );
    }
    const table = sql`${resourceSource} AS ${tableAlias}`;
    for (let i = 0; i < count; i++) {
      const value = values.map((v) => v[i]);

      const patch = this.attributes.find((attr) => attr.name === 'patch');

      const ids = this.attributes.filter((attr) => attr.name !== 'patch');

      const sqlWhereClauses: SQL[] = [];
      const sqlSets: SQL[] = [];
      const sqlSelects: SQL[] = [];

      ids.forEach((attr, index) => {
        const {name, depId, pgCodec} = attr;
        sqlWhereClauses[index] = sql.parens(
          sql`${sql.identifier(tableSymbol, name.toString())} = ${sql.value(pgCodec.toPg(value[depId]))}`
        );
      });

      if (patch?.depId) {
        const patchVal = value[patch.depId];

        const keyNames = Object.keys(patchVal);

        Object.entries(this.rightTable.codec.attributes)
          .filter(([k, _v]) => keyNames.includes(k))
          .forEach(([attr, _attrDeets], i) => {
            const identifier = sql.identifier(attr);
            const codecAttr = this.rightTable.codec.attributes[attr];
            if (!codecAttr?.codec) {
              return;
            }
            const value = sql.value(codecAttr.codec.toPg(patchVal[attr]));
            sqlSets[i] = sql`${identifier} = ${value}`;
            sqlSelects[i] = sql`${value} as ${identifier}`;
          });
      }
      const set = sql` set ${sql.join(sqlSets, ', ')}`;
      const where = sql` where ${sql.parens(sql.join(sqlWhereClauses, ' and '))}`;

      const returning =
        sqlSelects.length > 0
          ? sql` returning\n${sql.indent(sql.join(sqlSelects, '\n'))}`
          : sql.blank;

      const query = sql`update ${table}${set}${where}${returning};`;

      const compiled = sql.compile(query);

      const promise = this.rightTable.executor.executeMutation({
        context: value[this.contextId],
        ...compiled,
      });

      result[i] = promise.then(({rows}) => rows[0] ?? Object.create(null));
    }

    return result;
  }

  set<TKey extends keyof GetPgResourceAttributes<TNestedResource>>(
    name: TKey | 'patch',
    value: ExecutableStep // | PgTypedExecutableStep<TAttributes[TKey]["codec"]>
  ): void {
    if (this.locked) {
      throw new Error('Cannot set after plan is locked.');
    }
    if (isDev) {
      if (this.attributes.some((col) => col.name === name)) {
        throw new Error(
          `Attribute '${String(name)}' was specified more than once in ${this.relationName} updateById mutation`
        );
      }
    }
    if (name === 'patch') {
      this.attributes.push({
        name,
        depId: this.addDependency(value),
        pgCodec: this.rightTable.codec,
      });
    } else {
      const attribute = Object.entries(this.rightTable.codec.attributes).find(
        ([k, _v]) => k === name
      );
      if (!attribute) {
        throw new Error(
          `Attribute ${String(name)} not found in ${this.rightTable.name}`
        );
      }
      this.attributes.push({
        name,
        depId: this.addDependency(value),
        pgCodec: attribute[1].codec,
      });
    }
  }
}

export function nestedUpdateById<
  TNestedResource extends PgTableResource = PgTableResource,
>(
  rel: PgNestedMutationRelationship,
  $args: PgNestedAttributeMap<TNestedResource>
) {
  return new PgNestedMutationUpdateByIdStep<TNestedResource>(rel, $args);
}
