import {PgNestedMutationsInitSchemaPlugin} from './plugin.ts';

export const RelationshipMutationsPreset: GraphileConfig.Preset = {
  plugins: [PgNestedMutationsInitSchemaPlugin],
};
