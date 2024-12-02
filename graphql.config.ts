import type {IGraphQLConfig} from 'graphql-config';

const config: IGraphQLConfig = {
  schema: ['**/tmp/**/*.graphql'],
  documents: ['**/fixtures/**/*.graphql'],
};

export default config;
