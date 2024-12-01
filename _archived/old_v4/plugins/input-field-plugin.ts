import type {
  GrafastInputFieldConfigMap,
  ObjectStep,
  __InputObjectStep,
} from 'grafast';
import {__InputListStep} from 'grafast';
import type {GraphileConfig} from 'graphile-build';
import {isPgTableResource} from '../../../helpers.ts';
import {buildConnectByNodeIdField} from '../../type-definitions/build-connect-by-node-id-field.ts';
import {buildCreateField} from '../../type-definitions/build-create-field.ts';
import {buildUpdateByNodeIdField} from '../../type-definitions/build-update-by-node-id-field.ts';

/**
 * adds the relationship input field to the parent object
 */
export const PostGraphileNestedTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationTypesPlugin',
  description:
    'Builds and adds nested mutation input field with plans to parent object',
  /* eslint-disable-next-line @typescript-eslint/no-var-requires */
  version: require('../../package.json').version,
  after: ['PgNestedMutationConnectPlugin'],

  inflection: {
    add: {
      nestedConnectorFieldType(_options, details) {
        const {
          isReverse,
          leftTable,
          localAttributes,
          remoteAttributes,
          rightTable,
        } = details;
        // name for the Input Object
        // e.g., SessionUserIdFkeyInput for user object in SessionInput
        // e.g., SessionUserIdFkeyInverseInput for session object in UserInput

        // If leftTable contains foreign key
        // leftTableType + leftTable_attributes + Fkey + Input

        // if righTable contains foreign key
        // rightTable + rightTable_attributes + Fkey + input

        return this.upperCamelCase(
          [
            this.tableFieldName(isReverse ? rightTable : leftTable),
            [...(isReverse ? remoteAttributes : localAttributes)],
            'fKey',
            isReverse ? 'inverse' : null,
            'input',
          ]
            .filter(Boolean)
            .join('_')
        );
      },
      nestedConnectorFieldName(_options, details) {
        const {
          leftTable,
          rightTable,
          localAttributes,
          remoteAttributes,
          isUnique,
          isReverse,
        } = details;

        const tableFieldName = this.tableFieldName(rightTable);

        const multipleFks = Object.keys(leftTable.getRelations()).length > 1;

        const computedReverseMutationName = this.camelCase(
          isUnique ? tableFieldName : this.pluralize(tableFieldName)
        );

        if (!isReverse) {
          return this.camelCase(
            `${tableFieldName}_to_${localAttributes.join('_and_')}`
          );
        }

        if (!multipleFks) {
          return this.camelCase(
            `${computedReverseMutationName}_using_${localAttributes.join(
              '_and_ '
            )}`
          );
        }

        return this.camelCase(
          `${computedReverseMutationName}_to_${localAttributes.join(
            '_and_'
          )}_using_${remoteAttributes.join('_and_')}`
        );
      },
    },
  },

  schema: {
    /**
     * TODO: Scope actions to behaviors
     */
    entityBehavior: {},

    hooks: {
      build(build) {
        build.pgNestedMutationRelationships = new Map();
        build.pgNestedMutationInputObjMap = new Map();
        return build;
      },

      init(init, build) {
        const {
          pgNestedMutationInputObjMap,
          pgNestedMutationRelationships,
          pgNestedMutationInputTypes,
          inflection,
        } = build;

        const resources = build.input.pgRegistry.pgResources;

        for (const resource of Object.values(resources)) {
          if (!isPgTableResource(resource)) {
            continue;
          }
          const relationships =
            pgNestedMutationRelationships.get(resource.codec) ?? [];

          for (const relationship of relationships) {
            const {leftTable, mutationFields, localUnique, tableFieldName} =
              relationship;

            const patchFieldName = inflection.patchField(tableFieldName);

            /**Store the relevant fieldNames on which to add the connectorType */
            pgNestedMutationInputObjMap
              .set(inflection.createField(leftTable), {
                field: tableFieldName,
                codec: leftTable.codec,
              })
              .set(
                inflection.updateNodeField({
                  resource: leftTable,
                  unique: localUnique,
                }),
                {
                  field: patchFieldName,
                  codec: leftTable.codec,
                }
              );

            /**
             * Add the Connector Input Field
             * if there is at least one nestedField
             */

            const hasNestedFields =
              Object.keys(mutationFields).filter((k) => k !== 'input').length >
              0;

            // register the connectType
            if (hasNestedFields) {
              const {input} = mutationFields;
              if (!pgNestedMutationInputTypes.has(input.typeName)) {
                pgNestedMutationInputTypes.add(input.typeName);

                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    mutationFields.input.typeName,
                    {
                      isNestedInverseMutation: relationship.isReverse,
                      isNestedMutationConnectorType: true,
                    },
                    () => ({
                      description: build.wrapDescription(
                        `Input for the nested mutation of \`${relationship.leftTable.name}\` `,
                        'type'
                      ),
                      fields: ({fieldWithHooks}) => ({
                        ...(mutationFields.create
                          ? {
                              [mutationFields.create.fieldName]: fieldWithHooks(
                                ...buildCreateField(relationship, build)
                              ),
                            }
                          : {}),
                        ...(mutationFields.connectByNodeId
                          ? {
                              [mutationFields.connectByNodeId.fieldName]:
                                fieldWithHooks(
                                  ...buildConnectByNodeIdField(
                                    relationship,
                                    build
                                  )
                                ),
                            }
                          : {}),
                        ...(mutationFields.updateByNodeId
                          ? {
                              [mutationFields.updateByNodeId.fieldName]:
                                fieldWithHooks(
                                  ...buildUpdateByNodeIdField(
                                    relationship,
                                    build
                                  )
                                ),
                            }
                          : {}),
                      }),
                    }),
                    `PgNestedConnectorField for ${relationship.rightTable.name} in the ${relationship.leftTable.name} create or patch mutation`
                  );
                });
              }
            }
          }
        }

        return init;
      },

      GraphQLObjectType_fields_field(field, build, context) {
        const {
          scope: {isRootMutation, fieldName, fieldBehaviorScope},
        } = context;

        const fieldKey = build.pgNestedMutationInputObjMap.get(fieldName);
        const behaviors = build.behavior.parseBehaviorString(
          fieldBehaviorScope ?? ''
        );

        const isUpdate = Boolean(
          behaviors.find((b) => b.scope.includes('update'))
        );

        if (
          isRootMutation &&
          fieldKey &&
          build.pgNestedMutationRelationships.has(fieldKey.codec)
        ) {
          const fieldPathsToApplyArgs = (
            build.pgNestedMutationRelationships.get(fieldKey.codec) ?? []
          ).reduce<[string, string][]>((memo, rel) => {
            const connectorPath = rel.mutationFields.input.fieldName;
            const actions = Object.entries(rel.mutationFields).reduce<
              [string, string][]
            >((acc, [key, o]) => {
              if (
                ['input', 'connectByKeys', 'updateByKeys'].includes(key) ||
                !o.fieldName
              ) {
                return acc;
              }
              const tuple = [connectorPath, o.fieldName] as [string, string];
              return [...acc, tuple];
            }, []);
            return [...memo, ...actions];
          }, []);

          return {
            ...field,
            plan(parent, args, info) {
              // only applying to create?
              const previousPlan = field.plan!(parent, args, info);
              const inputPlan = previousPlan.get('result') as ObjectStep;
              const patchOrField = isUpdate ? 'patch' : fieldKey.field;
              for (const [connectorField, action] of fieldPathsToApplyArgs) {
                // don't apply the path if the key is not present in the input object
                const inputObj = args.getRaw(['input', patchOrField]).eval();

                if (inputObj[connectorField]) {
                  args.apply(inputPlan, [
                    'input',
                    patchOrField,
                    connectorField,
                    action,
                  ]);
                }
              }
              return previousPlan;
            },
          };
        }
        return field;
      },


      GraphQLInputObjectType_fields(fields, build, context) {
        const {EXPORTABLE} = build;
        const {
          fieldWithHooks,
          scope: {isPgRowType, pgCodec},
          Self,
        } = context;

        if (
          isPgRowType &&
          pgCodec &&
          build.pgNestedMutationRelationships.has(pgCodec)
        ) {
          const data = build.pgNestedMutationRelationships.get(pgCodec) ?? [];

          const addedFields = data.reduce<GrafastInputFieldConfigMap<any, any>>(
            (memo, relationship) => {
              const {
                mutationFields: {input},
                rightTable,
              } = relationship;

              const nestedType = build.getInputTypeByName(input.typeName);

              return {
                ...memo,
                [input.fieldName]: fieldWithHooks(
                  {
                    fieldName: input.fieldName,
                    isNestedMutationInputField: true,
                  },
                  {
                    description: build.wrapDescription(
                      `Input for the nested mutation of \`${rightTable.name}\ in the \`${Self.name}\` mutation`,
                      'field'
                    ),
                    type: nestedType,
                    autoApplyAfterParentApplyPlan: true,
                    applyPlan: EXPORTABLE(
                      () =>
                        function plan($parent, args, _info) {
                          const $inputObj = args.getRaw() as __InputObjectStep;
                          if ($inputObj.evalHas('updateById')) {
                            args.apply($parent);
                          }
                        },
                      []
                    ),
                  }
                ),
              };
            },
            {}
          );

          return build.extend(fields, addedFields, 'test');
        }

        return fields;
      },
    },
  },
};
