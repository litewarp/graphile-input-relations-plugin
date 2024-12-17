import {
  type FieldArgs,
  type InputStep,
  ObjectStep,
  type SetterStep,
  __InputListStep,
  __InputObjectStep,
  lambda,
} from 'grafast';
import {EXPORTABLE} from 'graphile-build';
import {
  type GraphQLInputFieldConfigMap,
  type GraphQLInputType,
  GraphQLList,
} from 'graphql';
import type {PgRelationInputData} from '../interfaces.ts';
import type {PgInsertSingleWithRelationInputsStep} from '../steps/the-step.ts';
import {isPgTableResource} from '../utils/resource.ts';

declare global {
  namespace GraphileBuild {
    interface Inflection {
      relationInputField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
    }
    interface ScopeInputObject {
      isRelationInputType?: boolean;
    }
    interface ScopeInputObjectFieldsField {
      isRelationInputField?: boolean;
      isRelationCreateInputField?: boolean;
      isRelationConnectByNodeInputField?: boolean;
      isRelationConnectByKeysInputField?: boolean;
      isRelationDisconnectByNodeInputField?: boolean;
      isRelationDisconnectByKeysInputField?: boolean;
      isRelationUpdateByNodeInputField?: boolean;
      isRelationUpdateByKeysInputField?: boolean;
      isRelationDeleteByNodeInputField?: boolean;
      isRelationDeleteByKeysInputField?: boolean;
    }
  }
}

export const PgRelationInputsTypesPlugin: GraphileConfig.Plugin = {
  name: 'PgRelationInputsTypesPlugin',
  description: 'Adds input types for relationships on pg table resource',
  version: '0.0.1',
  after: ['PgRelationInputsResourceFieldsPlugin'],
  experimental: true,

  inflection: {
    add: {
      relationInputField(_options, relationship) {
        const {
          isReferencee,
          isUnique,
          localAttributes,
          remoteAttributes,
          remoteResource,
        } = relationship;

        const attributes = !isReferencee ? localAttributes : remoteAttributes;
        const resourceName = isUnique
          ? remoteResource.name
          : this.pluralize(remoteResource.name);

        return this.camelCase(`${resourceName}-by-${attributes.join('-and-')}`);
      },
      relationInputType(_options, {relationName, localResource}) {
        const tableType = this.tableType(localResource.codec);
        return this.upperCamelCase(`${relationName}-${tableType}-input`);
      },
    },
  },

  schema: {
    hooks: {
      init(_, build) {
        const {
          behavior,
          inflection,
          graphql: {GraphQLNonNull},
        } = build;
        const relatableResources = Object.values(
          build.input.pgRegistry.pgResources
        ).filter((resource) => isPgTableResource(resource));

        for (const resource of relatableResources) {
          const relations = build.pgRelationInputsTypes[resource.name] ?? [];

          for (const relation of relations) {
            const {
              relationName,
              remoteResource,
              isUnique,
              isReferencee,
              remoteAttributes,
            } = relation;

            const inputFields =
              build.pgRelationInputsFields[remoteResource.name] ?? [];

            if (!inputFields) continue;

            const typeName = inflection.relationInputType(relation);

            build.recoverable(null, () => {
              const getType = (type: GraphQLInputType) => {
                return isUnique || !isReferencee
                  ? type
                  : new GraphQLList(new GraphQLNonNull(type));
              };
              const isInsertable = (attr: string) =>
                behavior.pgCodecAttributeMatches(
                  [remoteResource.codec, attr],
                  'attribute:insert'
                );
              const getGqlField = (attributeName: string) =>
                inflection.attribute({
                  attributeName,
                  codec: remoteResource.codec,
                });

              const prepareArgs = ($step: InputStep) =>
                lambda($step, (args) =>
                  Object.fromEntries(
                    Object.keys(remoteResource.codec.attributes)
                      .filter(isInsertable)
                      .map((attr) => [attr, args[getGqlField(attr)]])
                  )
                );

              const relationFields = (
                build.pgRelationInputsTypes[remoteResource.name] ?? []
              ).flatMap((r1) => {
                return (
                  build.pgRelationInputsFields[r1.remoteResource.name] ?? []
                ).map((r2) => [r1.fieldName, r2.fieldName]);
              });

              // check to see if the foreign key is on the local resource
              // if so, we need to make sure that the local resource is updatable
              // if (!isReferencee && !isUpdatable(build, resource)) {
              //   throw new Error(
              //     `Can't add create field for ${relationName} relation because ${resource.name} is not updatable`
              //   );
              // }
              build.registerInputObjectType(
                typeName,
                {
                  isRelationInputType: true,
                },
                () => ({
                  assertStep: ObjectStep,
                  description: build.wrapDescription(
                    `Relationship input type for ${relationName}`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => {
                    return Object.fromEntries(
                      inputFields.map(({fieldName, typeName, method, mode}) => {
                        return [
                          fieldName,
                          fieldWithHooks(
                            {
                              fieldName,

                              isRelationCreateInputField: method === 'create',
                              isRelationConnectByNodeInputField:
                                method === 'connect' && mode === 'node',
                              isRelationConnectByKeysInputField:
                                method === 'connect' && mode === 'keys',
                              isRelationDisconnectByNodeInputField:
                                method === 'disconnect' && mode === 'node',
                              isRelationDisconnectByKeysInputField:
                                method === 'disconnect' && mode === 'keys',
                              isRelationUpdateByNodeInputField:
                                method === 'update' && mode === 'node',
                              isRelationUpdateByKeysInputField:
                                method === 'update' && mode === 'keys',
                              isRelationDeleteByNodeInputField:
                                method === 'delete' && mode === 'node',
                              isRelationDeleteByKeysInputField:
                                method === 'delete' && mode === 'keys',
                            },
                            {
                              description: build.wrapDescription(
                                method === 'create'
                                  ? `A ${remoteResource.name} created and linked to this object`
                                  : mode === 'node'
                                    ? `${inflection.upperCamelCase(
                                        method
                                      )} a ${remoteResource.name} by node Id linked to this object`
                                    : `${inflection.upperCamelCase(
                                        method
                                      )} a ${remoteResource.name} by keys (${remoteAttributes.join(
                                        ', '
                                      )}) linked to this object`,
                                'field'
                              ),
                              type: getType(build.getInputTypeByName(typeName)),

                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (
                                  __InputListStep,
                                  __InputObjectStep,
                                  prepareArgs,
                                  relationFields,
                                  relationName
                                ) =>
                                  function plan(
                                    $parent: SetterStep,
                                    fieldArgs
                                  ) {
                                    const $input = fieldArgs.getRaw();
                                    if ($input instanceof __InputObjectStep) {
                                      $parent.set(
                                        relationName,
                                        prepareArgs($input)
                                      );
                                      for (const field of relationFields) {
                                        fieldArgs.apply($parent, field);
                                      }
                                    } else if (
                                      $input instanceof __InputListStep
                                    ) {
                                      const length = $input.evalLength();

                                      for (let i = 0; i < (length ?? 0); i++) {
                                        const $obj = $input.at(i);
                                        $parent.set(
                                          relationName,
                                          prepareArgs($obj)
                                        );
                                        for (const field of relationFields) {
                                          fieldArgs.apply($parent, [
                                            i,
                                            ...field,
                                          ]);
                                        }
                                      }
                                    }
                                  },
                                [
                                  __InputListStep,
                                  __InputObjectStep,
                                  prepareArgs,
                                  relationFields,
                                  relationName,
                                ]
                              ),
                            }
                          ),
                        ];
                      })
                    );
                  },
                }),
                `Creating input type for relationship ${relationName}`
              );
            });
          }
        }
        return _;
      },
      GraphQLInputObjectType_fields(fields, build, context) {
        const {inflection, wrapDescription} = build;
        const {
          fieldWithHooks,
          scope: {isPgRowType, pgCodec, isInputType, isPgPatch},
        } = context;

        if (isPgRowType && pgCodec && (isInputType || isPgPatch)) {
          const resource = build.input.pgRegistry.pgResources[pgCodec.name];

          if (resource && isPgTableResource(resource)) {
            const relations = build.pgRelationInputsTypes[resource.name] ?? [];
            const inputFields: GraphQLInputFieldConfigMap = {};

            for (const relation of relations) {
              const typeName = inflection.relationInputType(relation);
              const InputType = build.getInputTypeByName(typeName);

              inputFields[relation.fieldName] = fieldWithHooks(
                {
                  fieldName: relation.fieldName,
                  isRelationInputType: true,
                },
                () => ({
                  description: wrapDescription(
                    `Nested connector type for ${relation.relationName}`,
                    'field'
                  ),
                  type: InputType,
                  autoApplyAfterParentApplyPlan: true,
                  applyPlan: EXPORTABLE(
                    () =>
                      function plan(
                        $obj: PgInsertSingleWithRelationInputsStep,
                        fieldArgs: FieldArgs
                      ) {
                        fieldArgs.apply($obj);
                      },
                    []
                  ),
                })
              );
            }

            return build.extend(
              fields,
              inputFields,
              'Adding nested relationships to $pgCodec.name'
            );
          }
        }
        return fields;
      },
    },
  },
};
