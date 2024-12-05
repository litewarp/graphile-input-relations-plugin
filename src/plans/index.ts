import {getRelationConnectByKeysPlanResolver} from './connect-keys.ts';
import {getRelationConnectByNodePlanResolver} from './connect-node.ts';
import {getRelationCreatePlanResolver} from './create.ts';

export const createResolver = getRelationCreatePlanResolver;
export const connectByKeysResolver = getRelationConnectByKeysPlanResolver;
export const connectByNodeResolver = getRelationConnectByNodePlanResolver;
