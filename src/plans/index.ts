import {getRelationConnectPlanResolver} from './connect.ts';
import {getRelationCreatePlanResolver} from './create.ts';
import {getRelationDisconnectPlanResolver} from './disconnect.ts';
import {getRelationUpdatePlanResolver} from './update.ts';

export const createResolver = getRelationCreatePlanResolver;

export const connectResolver = getRelationConnectPlanResolver;
export const updateResolver = getRelationUpdatePlanResolver;
export const disconnectResolver = getRelationDisconnectPlanResolver;
