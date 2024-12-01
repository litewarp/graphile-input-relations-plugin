/**
 * Adds connectById and connectByKeys methods
 *
 * Should be run first, since it gathers all the relations
 */

import {getNestedRelationships} from '../../get-nested-relationships.ts';
import {isPgTableResource} from '../../../helpers.ts';

export const PostGraphileNestedMutationsConnectPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationConnectPlugin',
  description: 'Adds connectById and connectByKeys input types to schema',
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  version: require('../../package.json').version,
  after: ['PgTableNodePlugin'],
  before: ['PgNestedMutationTypesPlugin'],

  inflection: {
    add: {
      nestedConnectByNodeIdFieldName(_options) {
        return this.camelCase(`connect_by_${this.nodeIdFieldName()}`);
      },
      nestedConnectByNodeIdInputType(_options, {rightTable}) {
        const rightTableFieldName = this.tableFieldName(rightTable);
        return this.upperCamelCase(`${rightTableFieldName}_node_id_connect`);
      },
      nestedConnectByKeyInputType(_options, relationship) {
        // to do - allow overriding of names through tags
        const {leftTable, localUnique, tableFieldName} = relationship;

        const attributes = localUnique.attributes.map((attributeName) =>
          this.attribute({attributeName, codec: leftTable.codec})
        );

        const keyName = localUnique.isPrimary ? 'pk' : attributes.join('_');

        return this.upperCamelCase(`${tableFieldName}_${keyName}_connect`);
      },
      nestedConnectByKeyFieldName(_options, relationship) {
        const {leftTable, localUnique} = relationship;

        const attributes = localUnique.attributes.map((attributeName) =>
          this.attribute({attributeName, codec: leftTable.codec})
        );

        return this.camelCase(`connect_by_${attributes.join('_and_')}`);
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        build.pgNestedMutationRelationships = new Map();
        build.pgNestedMutationInputObjMap = new Map();
        build.pgNestedMutationInputTypes = new Set();
        return build;
      },

      init(init, build) {
        const {
          inflection,
          pgNestedMutationInputTypes,
          pgNestedMutationRelationships,
          graphql: {GraphQLID, GraphQLNonNull},
        } = build;

        const resources = build.input.pgRegistry.pgResources;

        const nodeIdField = inflection.nodeIdFieldName();

        for (const resource of Object.values(resources)) {
          if (!isPgTableResource(resource)) {
            continue;
          }
          const relationships = getNestedRelationships(resource, build);
          pgNestedMutationRelationships.set(resource.codec, relationships);

          for (const relationship of relationships) {
            const {
              rightTable,
              mutationFields: {connectByNodeId, connectByKeys},
            } = relationship;

            // if connectByNodeId type is defined, create the input object
            if (connectByNodeId) {
              // check to make sure we haven't already created the type
              if (!pgNestedMutationInputTypes.has(connectByNodeId.typeName)) {
                pgNestedMutationInputTypes.add(connectByNodeId.typeName);

                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    connectByNodeId.typeName,
                    {
                      isNestedMutationConnectByNodeIdType: true,
                      isNestedMutationInputType: true,
                    },
                    () => ({
                      description: build.wrapDescription(
                        `The globally unique \`ID\` to be used in the connection.`,
                        'type'
                      ),
                      fields: ({fieldWithHooks}) => ({
                        [nodeIdField]: fieldWithHooks(
                          {fieldName: nodeIdField},
                          () => ({
                            description: `The globally unique \`ID\` which identifies a single \`${rightTable.name}\` to be connected.`,
                            type: new GraphQLNonNull(GraphQLID),
                          })
                        ),
                      }),
                    }),
                    `Adding connect by nodeId input type for ${rightTable.name}`
                  );
                });
              }
            }

            // if connectByKeys types, iterate through and create the input objects
            if (connectByKeys?.length) {
              for (const connectByKey of connectByKeys) {
                // check to make sure we haven't already created the type
                if (!pgNestedMutationInputTypes.has(connectByKey.typeName)) {
                  pgNestedMutationInputTypes.add(connectByKey.typeName);
                }
              }
            }
          }
        }
        return init;
      },
    },
  },
};
