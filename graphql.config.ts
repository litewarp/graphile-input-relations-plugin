import type {IGraphQLConfig} from 'graphql-config';

const config: IGraphQLConfig = {
  schema: ['**/schemas/*.graphql'],
  documents: ['**/fixtures/**/*.graphql'],
};

export default config;
