import {getRelationConnectByKeysPlanResolver} from './connect-keys.ts';
import {getRelationConnectByNodePlanResolver} from './connect-node.ts';
import {getRelationCreatePlanResolver} from './create.ts';
import {getRelationUpdatePlanResolver} from './update.ts';

export const createResolver = getRelationCreatePlanResolver;
export const connectByKeysResolver = getRelationConnectByKeysPlanResolver;
export const connectByNodeResolver = getRelationConnectByNodePlanResolver;
export const updateResolver = getRelationUpdatePlanResolver;
