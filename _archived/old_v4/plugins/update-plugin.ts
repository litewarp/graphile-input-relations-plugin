import {EXPORTABLE} from 'postgraphile/tamedevil';
import {isPgTableResource} from '../../../helpers.ts';

export const PostGraphileNestedMutationsUpdatePlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationUpdatePlugin',
  description: 'Adds updateById and updateByKeys input types to schema',
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  version: require('../../package.json').version,
  after: ['PgNestedMutationConnectPlugin'],
  before: ['PgNestedMutationTypesPlugin'],

  inflection: {
    add: {
      nestedUpdateByNodeIdFieldName(_options) {
        return this.camelCase(`update_by_${this.nodeIdFieldName()}`);
      },
      nestedUpdateByNodeIdInputType(
        _options,
        {
          rightTable,
          tableFieldName,
          isReverse,
          localAttributes,
          remoteAttributes,
        }
      ) {
        const rightTableFieldName = this.tableFieldName(rightTable);

        const constraintName = isReverse
          ? [rightTableFieldName, ...remoteAttributes]
          : [tableFieldName, ...localAttributes];

        return this.upperCamelCase(
          [
            rightTableFieldName,
            'on',
            tableFieldName,
            'for',
            ...constraintName,
            'node',
            'id',
            'update',
          ].join('_')
        );
      },
      nestedUpdateByKeyFieldName(_options, _relationship) {
        return '';
      },
      nestedUpdateByKeyInputType(_options, _relationship) {
        return '';
      },
      nestedUpdatePatchType(_options, _relationship) {
        return '';
      },
    },
  },

  schema: {
    hooks: {
      init(init, build) {
        const {
          graphql: {GraphQLNonNull, GraphQLID},
          EXPORTABLE,
          inflection,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
        } = build;

        const resources = build.input.pgRegistry.pgResources;

        const nodeIdField = inflection.nodeIdFieldName();

        for (const resource of Object.values(resources)) {
          if (!isPgTableResource(resource)) {
            continue;
          }

          const relationships =
            pgNestedMutationRelationships.get(resource.codec) ?? [];

          for (const relationship of relationships) {
            const {
              rightTable,
              mutationFields: {updateByNodeId, updateByKeys},
            } = relationship;

            if (updateByNodeId) {
              if (!pgNestedMutationInputTypes.has(updateByNodeId.typeName)) {
                pgNestedMutationInputTypes.add(updateByNodeId.typeName);

                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    updateByNodeId.typeName,
                    {
                      isNestedMutationUpdateByNodeIdType: true,
                      isNestedMutationInputType: true,
                    },
                    () => ({
                      description: build.wrapDescription(
                        `The globally unique \`ID\` look up for the row to update`,
                        'type'
                      ),
                      fields: ({fieldWithHooks}) => {
                        const patchType = build.getGraphQLTypeByPgCodec(
                          rightTable.codec,
                          'patch'
                        );

                        if (!patchType) {
                          throw new Error(
                            `Could not find update patch type for ${rightTable.name}`
                          );
                        }

                        return {
                          [nodeIdField]: fieldWithHooks(
                            {fieldName: nodeIdField},
                            () => ({
                              description: build.wrapDescription(
                                `The globally unique \`ID\` which identifies a signle \`${rightTable.name}\` to be connected`,
                                'field'
                              ),
                              type: new GraphQLNonNull(GraphQLID),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (nodeIdField) =>
                                  function plan($parent, args, _info) {
                                    console.log('CONSOLE2');
                                    $parent.set(nodeIdField, args.get());
                                  },
                                [nodeIdField]
                              ),
                            })
                          ),
                          patch: fieldWithHooks({fieldName: 'patch'}, () => ({
                            description: build.wrapDescription(
                              `The nested patch object for ${build.getGraphQLTypeNameByPgCodec(rightTable.codec, 'input')}`,
                              'field'
                            ),
                            type: new GraphQLNonNull(patchType),
                            autoApplyAfterParentApplyPlan: true,
                            applyPlan: EXPORTABLE(
                              () =>
                                function plan($parent, args, _info) {
                                  console.log('CONSOLE');
                                  $parent.set('patch', args.get());
                                },
                              []
                            ),
                          })),
                        };
                      },
                    }),
                    `Adding updateByNodeId input type for ${rightTable.name} on ${resource.name}`
                  );
                });
              }
            }
          }
        }

        return init;
      },
    },
  },
};
