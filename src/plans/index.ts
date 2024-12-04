import type {
  PgInsertSingleStep,
  PgUpdateSingleStep,
} from 'postgraphile/@dataplan/pg';
import type {InputObjectFieldApplyPlanResolver} from 'postgraphile/grafast';
import type {
  PgRelationInputData,
  RelationInputTypeInfo,
} from '../interfaces.ts';
import {getRelationConnectByKeysPlanResolver} from './connect-keys.ts';
import {getRelationConnectByIdPlanResolver} from './connect-node.ts';
import {getRelationCreatePlanResolver} from './create.ts';

type GetFieldPlanResolverFn<
  TStep extends PgInsertSingleStep | PgUpdateSingleStep,
> = (
  build: GraphileBuild.Build,
  relation: PgRelationInputData
) => InputObjectFieldApplyPlanResolver<TStep>;

export function getResolverFn<
  TStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>({
  method,
  mode,
}: Pick<RelationInputTypeInfo, 'method' | 'mode' | 'unique'>):
  | GetFieldPlanResolverFn<TStep>
  | undefined {
  switch (method) {
    case 'create':
      return getRelationCreatePlanResolver;
    case 'connect':
      return mode === 'node'
        ? getRelationConnectByIdPlanResolver
        : getRelationConnectByKeysPlanResolver;
    case 'disconnect':
    // return getRelationConnectByKeysPlanResolver;
    case 'update':
      return undefined;
    case 'delete':
      return undefined;
    default:
      // return getRelationConnectByKeysPlanResolver;
      return undefined;
  }
}
