import {
  type ExecutableStep,
  type FieldArgs,
  ObjectStep,
  type __InputObjectStep,
  constant,
  object,
} from 'grafast';
import {EXPORTABLE} from 'graphile-build';
import {
  type GraphQLInputFieldConfigMap,
  type GraphQLInputType,
  GraphQLList,
  isObjectType,
} from 'graphql';
import type {PgRelationInputData, PgTableResource} from './interfaces.ts';
import {} from './plans/index.ts';
import {
  PgInsertSingleWithRelationInputsStep,
  pgInsertSingleWithRelationInputsStep,
} from './steps/the-step.ts';
import {isInsertable, isPgTableResource} from './utils/resource.ts';

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

export const PgRelationInputsPlugin: GraphileConfig.Plugin = {
  name: 'PgRelationInputsPlugin',
  description: 'Adds input types for relationships on pg table resource',
  version: '0.0.1',
  after: [
    'PgRelationInputsInitCreatePlugin',
    'PgRelationInputsConnectUpdateDeletePlugin',
  ],
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
      relationInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}Input`);
      },
    },
  },

  schema: {
    hooks: {
      init(_, build) {
        const {
          inflection,
          graphql: {GraphQLString, GraphQLNonNull},
        } = build;
        const insertableResources = Object.values(
          build.input.pgRegistry.pgResources
        ).filter(
          (resource) =>
            isPgTableResource(resource) && isInsertable(build, resource)
        );
        // TODO: REMOVE!!
        const duplicateTypes = new Set<string>();
        for (const resource of insertableResources) {
          build.recoverable(null, () => {
            const tableTypeName = inflection.tableType(resource.codec);
            const inputTypeName = `${inflection.createInputType(resource)}Extra`;
            const tableFieldName = inflection.tableFieldName(resource);
            build.registerInputObjectType(
              inputTypeName,
              {isMutationInput: true},
              () => ({
                description: `All input for the create \`${tableTypeName}\` mutation.`,
                fields: ({fieldWithHooks}) => {
                  const TableInput = build.getGraphQLTypeByPgCodec(
                    resource.codec,
                    'input'
                  );
                  return {
                    clientMutationId: {
                      type: GraphQLString,
                      autoApplyAfterParentApplyPlan: true,
                      applyPlan: EXPORTABLE(
                        () =>
                          function plan(
                            $input: ObjectStep<{
                              clientMutationId: ExecutableStep;
                            }>,
                            val
                          ) {
                            $input.set('clientMutationId', val.get());
                          },
                        []
                      ),
                    },
                    ...(TableInput
                      ? {
                          [tableFieldName]: fieldWithHooks(
                            {
                              fieldName: tableFieldName,
                              fieldBehaviorScope:
                                'insert:relation:input:record',
                            },
                            () => ({
                              description: build.wrapDescription(
                                `The \`${tableTypeName}\` to be created by this mutation.`,
                                'field'
                              ),
                              type: new GraphQLNonNull(TableInput),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                () =>
                                  function plan(
                                    $object: ObjectStep<{
                                      result: PgInsertSingleWithRelationInputsStep;
                                    }>
                                  ) {
                                    const $record =
                                      $object.getStepForKey('result');
                                    return $record.setPlan();
                                  },
                                []
                              ),
                            })
                          ),
                        }
                      : null),
                  };
                },
              }),
              `PgMutationCreatePlugin input for ${resource.name}`
            );

            // payload
            const payloadTypeName = `${inflection.createPayloadType(resource)}Extra`;
            build.registerObjectType(
              payloadTypeName,
              {
                isMutationPayload: true,
                isPgCreatePayloadType: true,
                pgTypeResource: resource,
              },
              () => ({
                fields: ({fieldWithHooks}) => {
                  const TableType = build.getGraphQLTypeByPgCodec(
                    resource.codec,
                    'output'
                  );
                  if (!isObjectType(TableType)) {
                    throw new Error(
                      `Could not determine type for table '${resource.name}'`
                    );
                  }

                  return {
                    clientMutationId: {
                      type: GraphQLString,
                      plan: EXPORTABLE(
                        (constant) =>
                          function plan(
                            $mutation: ObjectStep<{
                              clientMutationId: ExecutableStep;
                            }>
                          ) {
                            return (
                              $mutation.getStepForKey(
                                'clientMutationId',
                                true
                              ) ?? constant(null)
                            );
                          },
                        [constant]
                      ),
                    },
                    ...(TableType
                      ? {
                          [tableFieldName]: fieldWithHooks(
                            {fieldName: tableFieldName},
                            {
                              type: TableType,
                              plan: EXPORTABLE(
                                (resource) =>
                                  function plan(
                                    $object: ObjectStep<{
                                      result: PgInsertSingleWithRelationInputsStep;
                                    }>
                                  ) {
                                    const $result =
                                      $object.getStepForKey('result');
                                    const $id = $result.get('id');
                                    return resource.find({id: $id}).single();
                                  },
                                [resource]
                              ),
                            }
                          ),
                        }
                      : {}),
                  };
                },
              }),
              `PgMutationCreatePlugin payload for ${resource.name}`
            );
          });
          const relations = build.pgRelationInputsTypes[resource.name] ?? [];
          const relationFields =
            build.pgRelationInputsFields[resource.name] ?? [];

          for (const relation of relations) {
            const {
              relationName,
              remoteResource,
              isUnique,
              isReferencee,
              remoteAttributes,
            } = relation;

            const inputFields = relationFields.filter(
              (r) => r.relationName === relationName
            );

            if (!inputFields) continue;

            const typeName = inflection.relationInputType(relation);

            if (!duplicateTypes.has(typeName)) {
              duplicateTypes.add(typeName);

              build.recoverable(null, () => {
                const getType = (type: GraphQLInputType) => {
                  return isUnique || !isReferencee
                    ? type
                    : new GraphQLList(new GraphQLNonNull(type));
                };

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
                        inputFields.map(
                          ({fieldName, typeName, method, mode, unique}) => {
                            return [
                              fieldName,
                              fieldWithHooks(
                                {
                                  fieldName,

                                  isRelationCreateInputField:
                                    method === 'create',
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
                                        ? `${inflection.upperCamelCase(method)} a ${remoteResource.name} by node Id linked to this object`
                                        : `${inflection.upperCamelCase(method)} a ${remoteResource.name} by keys (${remoteAttributes.join(', ')}) linked to this object`,
                                    'field'
                                  ),
                                  type: getType(
                                    build.getInputTypeByName(typeName)
                                  ),

                                  autoApplyAfterParentApplyPlan: true,
                                  applyPlan: EXPORTABLE(
                                    () =>
                                      function plan($parent, fieldArgs, info) {
                                        console.log($parent);
                                      },
                                    []
                                  ),
                                }
                              ),
                            ];
                          }
                        )
                      );
                    },
                  }),
                  `Creating input type for relationship ${relationName}`
                );
              });
            }
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
                    (PgInsertSingleWithRelationInputsStep) =>
                      function plan(
                        $obj: PgInsertSingleWithRelationInputsStep,
                        fieldArgs: FieldArgs
                      ) {
                        if (
                          $obj instanceof PgInsertSingleWithRelationInputsStep
                        ) {
                          fieldArgs.apply($obj);
                        }
                      },
                    [PgInsertSingleWithRelationInputsStep]
                  ),
                })
              );
            }

            const rootFields = mapPgRelationshipRootFields(
              build,
              resource,
              Object.keys(inputFields)
            );

            for (const [fieldName, paths] of Object.entries(rootFields)) {
              build.pgRelationshipMutationRootFields.set(fieldName, paths);
            }

            return build.extend(
              fields,
              inputFields,
              `Adding nested relationships to ${pgCodec.name}`
            );
          }
        }
        return fields;
      },

      GraphQLObjectType_fields(fields, build, context) {
        const {
          inflection,
          graphql: {GraphQLNonNull},
        } = build;
        const {
          scope: {isRootMutation},
          fieldWithHooks,
        } = context;

        if (!isRootMutation) {
          return fields;
        }

        const insertableSources = Object.values(
          build.input.pgRegistry.pgResources
        ).filter(
          (resource) =>
            isPgTableResource(resource) && isInsertable(build, resource)
        );

        return insertableSources.reduce((memo, resource) => {
          return build.recoverable(memo, () => {
            const createFieldName = `${inflection.createField(resource)}Extra`;
            const payloadTypeName = `${inflection.createPayloadType(resource)}Extra`;
            const payloadType = build.getOutputTypeByName(payloadTypeName);
            const mutationInputType = build.getInputTypeByName(
              `${inflection.createInputType(resource)}Extra`
            );

            return build.extend(
              memo,
              {
                [createFieldName]: fieldWithHooks(
                  {fieldName: createFieldName},
                  {
                    args: {
                      input: {
                        type: new GraphQLNonNull(mutationInputType),
                        autoApplyAfterParentPlan: true,
                        applyPlan: EXPORTABLE(
                          () =>
                            function plan(
                              _: ExecutableStep,
                              $object: ObjectStep<{
                                result: PgInsertSingleWithRelationInputsStep;
                              }>
                            ) {
                              return $object;
                            },
                          []
                        ),
                      },
                    },
                    description: `Creates a single \`${inflection.tableType(resource.codec)}\` relation input.`,
                    type: payloadType,
                    plan: EXPORTABLE(
                      (
                        object,
                        pgInsertSingleWithRelationInputsStep,
                        resource
                      ) =>
                        function plan(
                          _$parent: ExecutableStep,
                          args: FieldArgs
                        ) {
                          const plan = object({
                            result: pgInsertSingleWithRelationInputsStep(
                              resource as PgTableResource,
                              args.getRaw('input') as __InputObjectStep
                            ),
                          });

                          return plan;
                        },
                      [object, pgInsertSingleWithRelationInputsStep, resource]
                    ),
                  }
                ),
              },
              `Adding create mutation field for ${resource.name}`
            );
          });
        }, fields);
      },
    },
  },
};

/**
 * Determine the root mutation input fields on the localResource to apply the args to
 * e.g., createParent => ['input', 'parent', 'childrenByTheirDadParentId'], ['input', 'parent', 'childrenByTheirMomParentId']
 */
const mapPgRelationshipRootFields = <
  TFieldName extends string = string,
  TResource extends PgTableResource = PgTableResource,
>(
  build: GraphileBuild.Build,
  resource: TResource,
  connectorFields: string[]
): Record<TFieldName, string[][]> => {
  const fieldNames = new Set<string>();
  const paths: string[][] = [];

  if (isInsertable(build, resource)) {
    fieldNames.add(build.inflection.createField(resource));
    build.pgRootFieldNamesToCodec.set(
      build.inflection.createField(resource),
      resource
    );
    paths.push(['input', build.inflection.tableFieldName(resource)]);
  }
  // if (isUpdatable(build, resource)) {
  //   // get the localResource specs to determine the root fields
  //   // to apply the arguments through
  //   const updateSpecs = getSpecs(build, resource, 'resource:update');
  //   for (const {uniqueMode, unique} of updateSpecs) {
  //     if (uniqueMode === 'node') {
  //       build.pgRootFieldNamesToCodec.set(
  //         build.inflection.updateNodeField({resource, unique}),
  //         resource
  //       );
  //     } else {
  //       build.pgRootFieldNamesToCodec.set(
  //         build.inflection.updateByKeysField({resource, unique}),
  //         resource
  //       );
  //     }
  //   }
  // }

  const allPaths = connectorFields.reduce((memo, connectorFieldName) => {
    memo.push(...paths.map((path) => [...path, connectorFieldName]));
    return memo;
  }, [] as string[][]);

  return Object.fromEntries(
    [...fieldNames.values()].map((fieldName) => {
      return [fieldName, allPaths];
    })
  ) as Record<TFieldName, string[][]>;
};
