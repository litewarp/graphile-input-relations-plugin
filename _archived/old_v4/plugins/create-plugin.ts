/**
 * Adds create methods
 *
 * Should be run after connect-plugin, since it gathers all the relations
 */

import {isPgTableResource} from '../../../helpers.ts';

export const PostGraphileNestedMutationsCreatePlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationCreatePlugin',
  description: 'Adds create nested object input types to schema',
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  version: require('../../package.json').version,
  after: ['PgNestedMutationConnectPlugin'],
  before: ['PgNestedMutationTypesPlugin'],

  inflection: {
    add: {
      nestedCreateFieldName(_options) {
        return 'create';
      },
      nestedCreateInputType(_options, details) {
        // Same as fieldType except no 'inverse' and then add rightTableName + 'create'
        const {
          leftTable,
          rightTable,
          localAttributes,
          remoteAttributes,
          isReverse,
        } = details;

        return this.upperCamelCase(
          [
            this.tableFieldName(isReverse ? rightTable : leftTable),
            [...(isReverse ? remoteAttributes : localAttributes)],
            'fkey',
            this.tableFieldName(rightTable),
            'create',
            'input',
          ]
            .filter(Boolean)
            .join('_')
        );
      },
    },
  },

  schema: {
    hooks: {
      init(init, build) {
        const {
          inflection,
          EXPORTABLE,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
        } = build;

        const resources = build.input.pgRegistry.pgResources;

        for (const resource of Object.values(resources)) {
          if (!isPgTableResource(resource)) {
            continue;
          }
          const relationships =
            pgNestedMutationRelationships.get(resource.codec) ?? [];

          for (const relationship of relationships) {
            const {
              isReverse,
              leftTable,
              rightTable,
              mutationFields: {create},
            } = relationship;

            // if create type is defined, create the input object
            if (create) {
              if (!pgNestedMutationInputTypes.has(create.typeName)) {
                pgNestedMutationInputTypes.add(create.typeName);

                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    create.typeName,
                    {
                      isNestedInverseMutation: isReverse,
                      isNestedMutationCreateInputType: true,
                      isNestedMutationInputType: true,
                    },
                    () => ({
                      description: build.wrapDescription(
                        `The \`${rightTable.name}\` to be created by this mutation.`,
                        'type'
                      ),
                      fields: ({fieldWithHooks}) => {
                        return Object.entries(
                          rightTable.codec.attributes
                        ).reduce((memo, [attributeName, attribute]) => {
                          const attributeType = build.getGraphQLTypeByPgCodec(
                            attribute.codec,
                            'input'
                          );
                          if (!attributeType) {
                            return memo;
                          }

                          const fieldName = inflection.attribute({
                            attributeName,
                            codec: rightTable.codec,
                          });

                          return {
                            ...memo,
                            [fieldName]: fieldWithHooks(
                              {fieldName, pgAttribute: attribute},
                              () => ({
                                description: attribute.description,
                                type: build.nullableIf(
                                  (!attribute.notNull &&
                                    !attribute.extensions?.tags?.notNull) ||
                                    attribute.hasDefault ||
                                    Boolean(
                                      attribute.extensions?.tags?.hasDefault
                                    ),
                                  attributeType
                                ),
                                applyPlan: EXPORTABLE(
                                  (field) =>
                                    function plan($parent, args) {
                                      $parent.set(field, args.get());
                                    },
                                  [attributeName]
                                ),
                              })
                            ),
                          };
                        }, {});
                      },
                    }),
                    `Generated input type for ${rightTable.name}`
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
