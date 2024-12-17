import {PgRelationInputsTypesPlugin} from './relationship-input-types.ts';
import {PgRelationInputsResourceFieldsPlugin} from './resource-input-types.ts';
import {PgRelationInputsFieldsPlugin} from './root-insert-field.ts';

export const plugins: GraphileConfig.Plugin[] = [
  PgRelationInputsResourceFieldsPlugin,
  PgRelationInputsTypesPlugin,
  PgRelationInputsFieldsPlugin,
];
