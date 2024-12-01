import {
  PgInsertSingleStep,
  type PgResource,
  PgUpdateSingleStep,
  withPgClientTransaction,
} from '@dataplan/pg';
import type {
  GraphQLInputField,
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLSchema,
} from 'graphql';
import type {} from 'postgraphile';
import {
  type FieldArgs,
  ListStep,
  ObjectStep,
  SetterStep,
  type __InputObjectStep,
  type __TrackedValueStep,
} from 'postgraphile/grafast';
import {relationshipInsertSingle} from './generators/insert.ts';
import {
  type PgTableResource,
  isDeletable,
  isInsertable,
  isPgTableResource,
  isUpdatable,
} from '../helpers.ts';
import {getRelationships} from '../relationships.ts';
import {pgRelationshipForwardConnectByNodeIdStep} from './steps/forward-connect-by-id.ts';
import {pgRelationshipForwardConnectByKeysStep} from './steps/forward-connect-by-keys.ts';
import {pgRelationshipReverseConnectByNodeIdStep} from './steps/reverse-connect-by-id.ts';
import {pgRelationshipReverseConnectByKeysStep} from './steps/reverse-connect-by-keys.ts';
import {pgRelationshipReverseInsertStep} from './steps/reverse-insert.ts';

export interface ResourceRelationshipMutationFields {
  insertable?: {name: string; type: string};
  connectable: {
    byKeys?: {name: string; type: string};
    byNodeId?: {name: string; type: string};
  };
  updateable: {
    byKeys?: {name: string; type: string};
    byNodeId?: {name: string; type: string};
  };
  deletable: {
    byKeys?: {name: string; type: string};
    byNodeId?: {name: string; type: string};
  };
}

/**
 * Determine the root mutation input fields on the localResource to apply the args to
 * e.g., createParent => ['input', 'parent', 'childrenByTheirDadParentId'], ['input', 'parent', 'childrenByTheirMomParentId']
 */
const mapPgRelationshipRootFields = <
  TFieldName extends string = string,
  TResource extends PgResource = PgResource,
>(
  build: GraphileBuild.Build,
  resource: TResource,
  connectorFields: GraphQLInputFieldConfigMap
): Record<TFieldName, string[][]> => {
  const fieldNames: string[] = [];
  const paths: string[][] = [];
  const isLocalResourceInsertable = isInsertable(build, resource);
  // const isLocalResourceUpdatable = isUpdatable(build, resource);

  if (isLocalResourceInsertable) {
    fieldNames.push(build.inflection.createField(resource));
    paths.push(['input', build.inflection.tableFieldName(resource)]);
  }
  // if (isLocalResourceUpdatable) {
  //   fieldNames.push(
  //     build.inflection.patchField(build.inflection.tableFieldName(resource))
  //   );
  //   paths.push(['input', 'patch']);
  // }

  const allPaths = Object.keys(connectorFields).reduce((memo, connectorFieldName) => {
    return [...memo, ...paths.map((path) => [...path, connectorFieldName])];
  }, [] as string[][]);

  return fieldNames.reduce(
    (memo, fieldName) => {
      return {
        ...memo,
        [fieldName]: allPaths,
      };
    },
    {} as Record<TFieldName, string[][]>
  );
};

declare global {
  namespace GraphileBuild {
    interface Build {
      pgRelationshipMutationRootFields: Map<string, string[][]>;
      pgRootFieldNamesToCodec: Map<string, PgTableResource>;
      pgRelationshipMutationFieldsByType: Map<string, ResourceRelationshipMutationFields>;
    }
    interface Inflection {
      relationshipConnectByNodeIdFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipConnectByNodeIdInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipConnectByKeysFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipConnectByKeysInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipCreateFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipCreateInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipDeleteFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipDeleteInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipInputFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipUpdateByNodeIdFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipUpdateByNodeIdInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipUpdateByKeysFieldName(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
      relationshipUpdateByKeysInputType(
        this: Inflection,
        relationship: PgResourceRelationInput
      ): string;
    }
    interface ScopeInputObject {
      name?: string;
      isRelationshipCreateInputType?: boolean;
      isRelationshipInputType?: boolean;
      isRelationshipNodeIdConnectInputType?: boolean;
      isRelationshipKeysConnectInputType?: boolean;
      isRelationshipInverse?: boolean;
      remoteResource?: PgTableResource;
    }
    interface ScopeInputObjectFieldsField {
      isRelationshipCreateInputField?: boolean;
      isRelationshipConnectorField?: boolean;
      isRelationshipNodeIdConnectField?: boolean;
      isRelationshipKeysConnectField?: boolean;
    }
  }
}

export const PgNestedMutationsInitSchemaPlugin: GraphileConfig.Plugin = {
  name: 'PgNestedMutationsInitSchemaPlugin',
  description: 'Gathers the context data for the nested mutations plugin',
  version: '0.0.1',
  after: ['smart-tags', 'PgFakeConstraintsPlugin', 'PgTablesPlugin', 'PgRelationsPlugin'],
  experimental: true,

  inflection: {
    add: {
      relationshipConnectByNodeIdFieldName(_options, _relationship) {
        return this.camelCase(`connect-by-${this.nodeIdFieldName()}`);
      },
      relationshipConnectByNodeIdInputType(_options, {name}) {
        return this.upperCamelCase(`${name}-connect-by-node-id-input`);
      },
      relationshipConnectByKeysFieldName(_options, {remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.camelCase(`connect-by-${attrs.join('-and-')}`);
      },
      relationshipConnectByKeysInputType(_options, {name, remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.upperCamelCase(`${name}-connect-by-${attrs.join('-and-')}-input`);
      },
      relationshipCreateFieldName(_options, _relationship) {
        return this.camelCase(`create`);
      },
      relationshipCreateInputType(_options, {name}) {
        return this.upperCamelCase(`${name}-create-input`);
      },
      relationshipInputFieldName(_options, relationship) {
        const {
          remoteResource,
          isUnique,
          isReferencee,
          localAttributes,
          remoteAttributes,
        } = relationship;

        const attributes = (!isReferencee ? localAttributes : remoteAttributes).map(
          (a) => a.name
        );
        const resourceName = isUnique
          ? remoteResource.name
          : this.pluralize(remoteResource.name);

        return this.camelCase(`${resourceName}-by-${attributes.join('-and-')}`);
      },
      relationshipInputType(_options, {name}) {
        return this.upperCamelCase(`${name}Input`);
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        /**
         * Instantiate the context properties on the build object
         */
        build.pgRelationshipMutationRootFields = new Map();
        build.pgRootFieldNamesToCodec = new Map();
        build.pgRelationshipMutationFieldsByType = new Map();

        return build;
      },

      init(_, build) {
        const {
          inflection,
          graphql: {GraphQLList, GraphQLNonNull, GraphQLID},
          wrapDescription,
          EXPORTABLE,
        } = build;

        const relationshipInputTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          (resource) => isPgTableResource(resource)
        );

        tableResources.forEach((resource) => {
          const relationships = getRelationships(build, resource);

          relationships.forEach((relationship) => {
            const {isReferencee, isUnique, remoteResource, name} = relationship;

            const relationshipTypeName = inflection.relationshipInputType(relationship);

            if (relationshipInputTypes.has(relationshipTypeName)) {
              // console.log(`Skipping ${relationshipTypeName}: already exists`);
              return;
            }
            relationshipInputTypes.add(relationshipTypeName);

            const insertable = isInsertable(build, remoteResource);
            const updateable = isUpdatable(build, remoteResource);
            const deletable = isDeletable(build, remoteResource);
            // TODO: Move out of conditional once behaviors are implemented
            // for now, if you're updateable, you are connectable
            const connectable = updateable;

            const fields: ResourceRelationshipMutationFields = {
              connectable: {},
              deletable: {},
              updateable: {},
            };

            if (insertable) {
              const createFieldName =
                inflection.relationshipCreateFieldName(relationship);
              const createTypeName = inflection.relationshipCreateInputType(relationship);

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  createTypeName,
                  {
                    isRelationshipCreateInputType: true,
                    remoteResource,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `The ${inflection.tableType(remoteResource.codec)} to be created by this mutation.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      const TableType = build.getGraphQLTypeByPgCodec(
                        remoteResource.codec,
                        'input'
                      );
                      return {
                        ...Object.entries(
                          (TableType as GraphQLInputObjectType).getFields()
                        ).reduce(
                          (memo, [name, field]) => ({
                            ...memo,
                            [name]: fieldWithHooks({fieldName: name}, field),
                          }),
                          Object.create(null)
                        ),
                      };
                    },
                  }),
                  `Add a relationship create input type for ${remoteResource.name} on ${name}`
                );
                fields.insertable = {name: createFieldName, type: createTypeName};
              });
            }

            // TODO: use getUniqueMode and choose one or the other
            // const uniqueMode = getUniqueMode(build, remoteResource, 'insert');

            if (connectable) {
              // TODO: ADD TO BEHAVIORS
              const connectByNodeIdName =
                inflection.relationshipConnectByNodeIdFieldName(relationship);
              const connectByNodeIdTypeName =
                inflection.relationshipConnectByNodeIdInputType(relationship);

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  connectByNodeIdTypeName,
                  {
                    isRelationshipNodeIdConnectInputType: true,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `Relationship connect by node id for ${remoteResource.name} in the ${name} relationship`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      return {
                        [inflection.nodeIdFieldName()]: fieldWithHooks(
                          {fieldName: inflection.nodeIdFieldName()},
                          () => ({
                            description: wrapDescription(
                              `The node id input field to connect ${remoteResource.name} in the ${name} relationship`,
                              'field'
                            ),
                            type: new GraphQLNonNull(GraphQLID),
                          })
                        ),
                      };
                    },
                  }),
                  `Creating relationship connect by node id input type for ${name}`
                );
                fields.connectable.byNodeId = {
                  name: connectByNodeIdName,
                  type: connectByNodeIdTypeName,
                };
              });

              // TODO: ADD TO BEHAVIORS

              const connectByKeysName =
                inflection.relationshipConnectByKeysFieldName(relationship);
              const connectByKeysType =
                inflection.relationshipConnectByKeysInputType(relationship);

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  connectByKeysType,
                  {
                    isRelationshipKeysConnectInputType: true,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: wrapDescription(
                      `Relationship connect by keys for ${name}`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      return relationship.remoteAttributes.reduce((memo, a) => {
                        const attribute = remoteResource.codec.attributes[a.name];

                        const AttributeType = attribute
                          ? build.getGraphQLTypeByPgCodec(attribute.codec, 'input')
                          : null;

                        if (!attribute || !AttributeType) {
                          return memo;
                        }
                        const fieldName = inflection.attribute({
                          attributeName: a.name,
                          codec: remoteResource.codec,
                        });

                        return {
                          ...memo,
                          [fieldName]: fieldWithHooks({fieldName: a.name}, () => ({
                            description: wrapDescription(
                              `The ${a.name} input field to connect ${remoteResource.name} in the ${name} relationship`,
                              'field'
                            ),
                            type: new GraphQLNonNull(AttributeType),
                            applyPlan: EXPORTABLE(
                              (attributeName) =>
                                function plan($insert, val) {
                                  $insert.set(attributeName, val.get());
                                },
                              [a.name]
                            ),
                            autoApplyAfterParentApplyPlan: true,
                          })),
                        };
                      }, {});
                    },
                  }),
                  `Creating relationship connect by keys input type for ${name}`
                );
              });
              fields.connectable.byKeys = {
                name: connectByKeysName,
                type: connectByKeysType,
              };
            }

            // if (updateable) {
            //   const updateByNodeIdName = '';
            //   const updateByNodeIdTypeName = '';
            //   build.registerInputObjectType();
            // }

            if (deletable) {
            }

            build.recoverable(null, () => {
              build.registerInputObjectType(
                relationshipTypeName,
                {
                  name,
                  isRelationshipInputType: true,
                  isRelationshipInverse: isReferencee,
                  remoteResource: remoteResource,
                },
                () => ({
                  assertStep: ObjectStep,
                  description: wrapDescription(
                    `Relationship input type for ${name}`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => ({
                    ...(fields.insertable
                      ? {
                          [fields.insertable.name]: fieldWithHooks(
                            {
                              fieldName: fields.insertable.name,
                              isRelationshipCreateInputField: true,
                              remoteResource,
                            },
                            {
                              type:
                                isUnique || !isReferencee
                                  ? build.getInputTypeByName(fields.insertable.type)
                                  : new GraphQLList(
                                      new GraphQLNonNull(
                                        build.getInputTypeByName(fields.insertable.type)
                                      )
                                    ),
                              description: wrapDescription(
                                `A ${inflection.tableType(remoteResource.codec)} created and linked to this object`,
                                'type'
                              ),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (
                                  build,
                                  isReferencee,
                                  isUnique,
                                  pgRelationshipReverseInsertStep,
                                  relationship,
                                  relationshipInsertSingle,
                                  resource,
                                  withPgClientTransaction
                                ) =>
                                  function plan(
                                    $parent: PgInsertSingleStep | PgUpdateSingleStep,
                                    args: FieldArgs,
                                    _info: {
                                      schema: GraphQLSchema;
                                      entity: GraphQLInputField;
                                    }
                                  ) {
                                    if (isUnique || !isReferencee) {
                                      const $data = withPgClientTransaction(
                                        resource.executor,
                                        build.grafast.list([
                                          build.grafast.object({id: $parent.get('id')}),
                                          args.get(),
                                        ]),
                                        async (client, [parent, input]) => {
                                          const result = relationshipInsertSingle(
                                            build,
                                            relationship,
                                            input,
                                            parent
                                          );
                                          console.log(build.sql.compile(result));

                                          const res = await client.withTransaction((tx) =>
                                            tx.query(build.sql.compile(result))
                                          );

                                          return res.rows[0];
                                        }
                                      );
                                      // pgRelationshipForwardInsertStep(
                                      //   build,
                                      //   args.get() as ObjectStep,
                                      //   $parent,
                                      //   relationship
                                      // );
                                    } else {
                                      pgRelationshipReverseInsertStep(
                                        build,
                                        args.get() as ListStep<__InputObjectStep[]>,
                                        $parent,
                                        relationship
                                      );
                                    }
                                  },
                                [
                                  build,
                                  isReferencee,
                                  isUnique,
                                  pgRelationshipReverseInsertStep,
                                  relationship,
                                  relationshipInsertSingle,
                                  resource,
                                  withPgClientTransaction,
                                ]
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(fields.connectable.byNodeId
                      ? {
                          [fields.connectable.byNodeId.name]: fieldWithHooks(
                            {
                              fieldName: fields.connectable.byNodeId.name,
                              remoteResource,
                              isRelationshipNodeIdConnectField: true,
                            },
                            {
                              description: wrapDescription(
                                `Connect ${name} by node id`,
                                'field'
                              ),
                              type:
                                isUnique || !isReferencee
                                  ? build.getInputTypeByName(
                                      fields.connectable.byNodeId.type
                                    )
                                  : new GraphQLList(
                                      new GraphQLNonNull(
                                        build.getInputTypeByName(
                                          fields.connectable.byNodeId.type
                                        )
                                      )
                                    ),
                              applyPlan: EXPORTABLE(
                                (
                                  build,
                                  inflection,
                                  isReferencee,
                                  isUnique,
                                  pgRelationshipForwardConnectByNodeIdStep,
                                  pgRelationshipReverseConnectByNodeIdStep,
                                  relationship,
                                  remoteResource
                                ) =>
                                  function plan(
                                    $object: PgUpdateSingleStep | PgInsertSingleStep,
                                    args: FieldArgs
                                  ) {
                                    const handler =
                                      build.getNodeIdHandler &&
                                      build.getNodeIdHandler(
                                        inflection.tableType(remoteResource.codec)
                                      );
                                    if (!handler) {
                                      throw new Error(
                                        `Could not find node handler for ${inflection.tableType(remoteResource.codec)}`
                                      );
                                    }
                                    if (isUnique || !isReferencee) {
                                      pgRelationshipForwardConnectByNodeIdStep(
                                        build,
                                        handler,
                                        args.get() as ObjectStep,
                                        $object,
                                        relationship
                                      );
                                    } else {
                                      pgRelationshipReverseConnectByNodeIdStep(
                                        build,
                                        handler,
                                        args.get() as ListStep<__InputObjectStep[]>,
                                        $object,
                                        relationship
                                      );
                                    }
                                  },
                                [
                                  build,
                                  inflection,
                                  isReferencee,
                                  isUnique,
                                  pgRelationshipForwardConnectByNodeIdStep,
                                  pgRelationshipReverseConnectByNodeIdStep,
                                  relationship,
                                  remoteResource,
                                ]
                              ),
                              autoApplyAfterParentApplyPlan: true,
                            }
                          ),
                        }
                      : {}),
                    ...(fields.connectable.byKeys
                      ? {
                          [fields.connectable.byKeys.name]: fieldWithHooks(
                            {
                              fieldName: fields.connectable.byKeys.name,
                              remoteResource,
                              isRelationshipKeysConnectField: true,
                            },
                            {
                              description: wrapDescription(
                                `Connect ${name} by key`,
                                'field'
                              ),
                              type:
                                isUnique || !isReferencee
                                  ? build.getInputTypeByName(
                                      fields.connectable.byKeys.type
                                    )
                                  : new GraphQLList(
                                      new GraphQLNonNull(
                                        build.getInputTypeByName(
                                          fields.connectable.byKeys.type
                                        )
                                      )
                                    ),
                              applyPlan: EXPORTABLE(
                                (
                                  build,
                                  isReferencee,
                                  isUnique,
                                  pgRelationshipForwardConnectByKeysStep,
                                  pgRelationshipReverseConnectByKeysStep,
                                  relationship
                                ) =>
                                  function plan(
                                    $object: PgUpdateSingleStep | PgInsertSingleStep,
                                    args: FieldArgs
                                  ) {
                                    if (isUnique || !isReferencee) {
                                      pgRelationshipForwardConnectByKeysStep(
                                        build,
                                        args.get() as ObjectStep,
                                        $object,
                                        relationship
                                      );
                                    } else {
                                      pgRelationshipReverseConnectByKeysStep(
                                        build,
                                        args.get() as ListStep<__InputObjectStep[]>,
                                        $object,
                                        relationship
                                      );
                                    }
                                  },
                                [
                                  build,
                                  isReferencee,
                                  isUnique,
                                  pgRelationshipForwardConnectByKeysStep,
                                  pgRelationshipReverseConnectByKeysStep,
                                  relationship,
                                ]
                              ),
                              autoApplyAfterParentApplyPlan: true,
                            }
                          ),
                        }
                      : {}),

                    ...(fields.updateable.byNodeId ? {} : {}),
                    ...(fields.updateable.byKeys ? {} : {}),

                    ...(fields.deletable.byNodeId ? {} : {}),
                    ...(fields.deletable.byKeys ? {} : {}),
                  }),
                }),
                `Creating input type for relationship ${name}`
              );
              build.pgRelationshipMutationFieldsByType.set(relationshipTypeName, fields);
            });
          });
        });
        return _;
      },
      GraphQLInputObjectType_fields(fields, build, context) {
        const {inflection, wrapDescription, EXPORTABLE} = build;
        const {
          fieldWithHooks,
          scope: {isPgRowType, pgCodec, isInputType, isPgPatch},
        } = context;

        if (isPgRowType && pgCodec && (isInputType || isPgPatch)) {
          const resource = build.input.pgRegistry.pgResources[pgCodec.name];
          if (resource && isPgTableResource(resource)) {
            const relationships = getRelationships(build, resource);
            const connectorFields: GraphQLInputFieldConfigMap = relationships.reduce(
              (memo, relationship) => {
                const fieldName = inflection.relationshipInputFieldName(relationship);
                const typeName = inflection.relationshipInputType(relationship);
                const InputType = build.getInputTypeByName(typeName);
                return {
                  ...memo,
                  [fieldName]: fieldWithHooks(
                    {
                      fieldName,
                      isRelationshipConnectorField: true,
                    },
                    () => ({
                      assertStep: ObjectStep,
                      description: wrapDescription(
                        `Nested connector type for ${relationship.name}`,
                        'field'
                      ),
                      type: InputType,
                      autoApplyAfterParentApplyPlan: true,
                      applyPlan: EXPORTABLE(
                        (PgInsertSingleStep, PgUpdateSingleStep) =>
                          function plan(
                            $object: SetterStep,
                            args: FieldArgs,
                            _info: {entity: GraphQLInputField; schema: GraphQLSchema}
                          ) {
                            if (
                              $object instanceof PgInsertSingleStep ||
                              $object instanceof PgUpdateSingleStep
                            ) {
                              args.apply($object);
                            } else {
                            }
                          },
                        [PgInsertSingleStep, PgUpdateSingleStep]
                      ),
                    })
                  ),
                };
              },
              Object.create(null)
            );

            const rootFields = mapPgRelationshipRootFields(
              build,
              resource,
              connectorFields
            );

            Object.entries(rootFields).forEach(([fieldName, paths]) => {
              build.pgRelationshipMutationRootFields.set(fieldName, paths);
              build.pgRootFieldNamesToCodec.set(fieldName, resource);
            });

            return build.extend(
              fields,
              connectorFields,
              `Adding nested relationships to ${pgCodec.name}`
            );
          }
        }
        return fields;
      },

      GraphQLObjectType_fields_field(field, build, context) {
        const {EXPORTABLE, pgRelationshipMutationRootFields} = build;
        const {
          scope: {isRootMutation, fieldName},
        } = context;

        if (isRootMutation) {
          const rootFields = pgRelationshipMutationRootFields.get(fieldName);
          return {
            ...field,
            plan: EXPORTABLE(
              (field, rootFields) =>
                function plan($parent: __TrackedValueStep, fieldArgs, info) {
                  if (!field.plan) {
                    return $parent;
                  }

                  const $resolved = field.plan($parent, fieldArgs, info);

                  // apply field args to all connector fields in the relationship mutation input
                  if (!rootFields) {
                    return $resolved;
                  }

                  const $result = $resolved.get('result');

                  rootFields.forEach((path) => {
                    fieldArgs.apply($result, path);
                  });

                  return $resolved;
                },

              [field, rootFields]
            ),
          };
        }

        return field;
      },
    },
  },
};
