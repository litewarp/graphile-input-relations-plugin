import {PgRelationInputsConnectUpdateDeletePlugin} from './connect-update-delete-plugin.ts';
import {PgRelationInputsPlugin} from './field-inputs-plugin.ts';
import {PgRelationInputsInitCreatePlugin} from './init-create-plugin.ts';

export const PgRelationInputsPreset: GraphileConfig.Preset = {
  plugins: [
    PgRelationInputsInitCreatePlugin,
    PgRelationInputsConnectUpdateDeletePlugin,
    PgRelationInputsPlugin,
  ],
};
