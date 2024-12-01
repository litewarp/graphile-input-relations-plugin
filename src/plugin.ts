import {PgInsertSingleStep, PgUpdateSingleStep} from '@dataplan/pg';
import {
  type GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  type GraphQLInputType,
} from 'graphql';
import {
  type FieldArgs,
  ObjectStep,
  SetterStep,
  type __TrackedValueStep,
} from 'postgraphile/grafast';
import {
  type PgTableResource,
  isDeletable,
  isInsertable,
  isPgTableResource,
  isUpdatable,
} from './helpers.ts';
import {getNestedConnectByIdPlanResolver} from './plans/connect-node.ts';
import {getNestedCreatePlanResolver} from './plans/create.ts';
import {type PgRelationInputData, getRelationships} from './relationships.ts';

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

declare global {
  namespace GraphileBuild {
    interface Build {
      pgRelationshipMutationRootFields: Map<string, string[][]>;
      pgRootFieldNamesToCodec: Map<string, PgTableResource>;
      pgRelationshipInputTypes: Record<string, PgRelationInputData[]>;
    }
    interface Inflection {
      relationConnectNodeField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationConnectNodeInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationConnectByKeysField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationConnectByKeysInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationCreateField(this: Inflection, relationship: PgRelationInputData): string;
      relationCreateInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationDeleteNodeField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationDeleteNodeInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationInputField(this: Inflection, relationship: PgRelationInputData): string;
      relationInputType(this: Inflection, relationship: PgRelationInputData): string;
      relationUpdateNodeField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationUpdateNodeInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationUpdateByKeysField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationUpdateByKeysInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
    }
    interface ScopeInputObject {
      relationName?: string;
      isRelationCreateInputType?: boolean;
      isRelationInputType?: boolean;
      isRelationConnectNodeInputType?: boolean;
      isRelationConnectByKeysInputType?: boolean;
      isRelationUpdateByNodeInputType?: boolean;
    }
    interface ScopeInputObjectFieldsField {
      isRelationCreateField?: boolean;
      isRelationConnectNodeField?: boolean;
      isRelationConnectByKeysField?: boolean;
      isRelationUpdateNodeField?: boolean;
      isRelationUpdateByKeysField?: boolean;
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
      relationConnectNodeField(_options, _relationship) {
        return this.camelCase(`connect-by-${this.nodeIdFieldName()}`);
      },
      relationConnectNodeInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-connect-by-node-id-input`);
      },
      relationConnectByKeysField(_options, {remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.camelCase(`connect-by-${attrs.join('-and-')}`);
      },
      relationConnectByKeysInputType(_options, {relationName, remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.upperCamelCase(
          `${relationName}-connect-by-${attrs.join('-and-')}-input`
        );
      },
      relationCreateField(_options, _relationship) {
        return this.camelCase(`create`);
      },
      relationCreateInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-create-input`);
      },
      relationInputField(_options, relationship) {
        const {
          isReferencee,
          isUnique,
          localAttributes,
          remoteAttributes,
          remoteResource,
        } = relationship;

        const attributes = (!isReferencee ? localAttributes : remoteAttributes).map(
          (a) => a.name
        );
        const resourceName = isUnique
          ? remoteResource.name
          : this.pluralize(remoteResource.name);

        return this.camelCase(`${resourceName}-by-${attributes.join('-and-')}`);
      },
      relationInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}Input`);
      },
      relationUpdateNodeField(_options, _relationship) {
        return '';
      },
      relationUpdateNodeInputType(_options, _relationship) {
        return '';
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        /**
         * Instantiate the context properties on the build object
         */
        build.pgRelationshipInputTypes = {};
        build.pgRelationshipMutationRootFields = new Map();
        build.pgRootFieldNamesToCodec = new Map();

        return build;
      },

      init(_, build) {
        const {
          inflection,
          EXPORTABLE,
          graphql: {GraphQLList, GraphQLNonNull},
        } = build;

        const relationshipInputTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          (resource) => isPgTableResource(resource)
        );

        tableResources.forEach((resource) => {
          const relationships = getRelationships(build, resource);

          build.pgRelationshipInputTypes[resource.name] = relationships;

          relationships.forEach((relation) => {
            const {isReferencee, isUnique, remoteResource, relationName} = relation;

            const relationshipTypeName = inflection.relationInputType(relation);

            if (relationshipInputTypes.has(relationshipTypeName)) {
              // console.log(`Skipping ${relationshipTypeName}: already exists`);
              return;
            }
            relationshipInputTypes.add(relationshipTypeName);

            const insertable = isInsertable(build, remoteResource);
            const updateable = isUpdatable(build, remoteResource);
            const deletable = isDeletable(build, remoteResource);
            // for now, if you're updateable, you are connectable
            const connectable = updateable;

            const fields: ResourceRelationshipMutationFields = {
              connectable: {},
              deletable: {},
              updateable: {},
            };

            if (insertable) {
              const create = {
                fieldName: inflection.relationCreateField(relation),
                typeName: inflection.relationCreateInputType(relation),
              };

              build.recoverable(null, () => {
                build.registerInputObjectType(
                  create.typeName,
                  {
                    isRelationCreateInputType: true,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: build.wrapDescription(
                      `The ${inflection.tableType(remoteResource.codec)} to be created by this mutation.`,
                      'type'
                    ),
                    fields: ({fieldWithHooks}) => {
                      const TableType = build.getGraphQLTypeByPgCodec(
                        remoteResource.codec,
                        'input'
                      );
                      const primaryKeyAttrs = (
                        remoteResource.uniques.find((u) => u.isPrimary) ?? {
                          attributes: [],
                        }
                      ).attributes.map((a) =>
                        inflection.attribute({
                          attributeName: a,
                          codec: remoteResource.codec,
                        })
                      );

                      return {
                        ...Object.entries(
                          (TableType as GraphQLInputObjectType).getFields()
                        ).reduce((memo, [name, field]) => {
                          // if the foreign keys live on the remote resource
                          // allow them to be null so we can set them later

                          if (isReferencee && primaryKeyAttrs.includes(name)) {
                            return {
                              ...memo,
                              [name]: fieldWithHooks(
                                {fieldName: name},
                                {
                                  ...field,
                                  type: build.graphql.isNonNullType(field.type)
                                    ? field.type.ofType
                                    : field.type,
                                }
                              ),
                            };
                          }

                          return {
                            ...memo,
                            [name]: fieldWithHooks({fieldName: name}, field),
                          };
                        }, Object.create(null)),
                      };
                    },
                  }),
                  `Add a relationship create input type for ${remoteResource.name} on ${relationName}`
                );
                fields.insertable = {
                  name: create.fieldName,
                  type: create.typeName,
                };
              });
            }

            if (updateable) {
              const mode = 'node';
              if (mode === 'node') {
                const updateByNode = {
                  fieldName: inflection.relationUpdateNodeField(relation),
                  typeName: inflection.relationUpdateNodeInputType(relation),
                };
                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    updateByNode.typeName,
                    {isRelationUpdateByNodeInputType: true},
                    () => ({}),
                    `Creating relationship update by node id input type for ${relationName} relationship`
                  );
                });
              }
            }
            if (deletable) {
            }
            if (connectable) {
              // use update for now
              // const mode = getUniqueMode(build, remoteResource, 'update');
              const mode = 'node';

              if (mode === 'node') {
                const fieldName = inflection.relationConnectNodeField(relation);
                const typeName = inflection.relationConnectNodeInputType(relation);

                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    typeName,
                    {isRelationConnectNodeInputType: true},
                    () => ({
                      description: build.wrapDescription(
                        `Relationship connect by node id input field for ${remoteResource.name} in the ${relationName} relationship`,
                        `type`
                      ),
                      fields: ({fieldWithHooks}) => ({
                        [inflection.nodeIdFieldName()]: fieldWithHooks(
                          {fieldName: inflection.nodeIdFieldName()},
                          () => ({
                            description: build.wrapDescription(
                              `The node id input field to connect ${remoteResource.name} in the ${relationName} relationship`,
                              'field'
                            ),
                            type: new GraphQLNonNull(build.graphql.GraphQLID),
                          })
                        ),
                      }),
                    }),
                    `Creating relationship connect by node id input type for ${relationName} relationship`
                  );
                  fields.connectable.byNodeId = {
                    name: fieldName,
                    type: typeName,
                  };
                });
              }
            }

            build.recoverable(null, () => {
              build.pgRelationshipInputTypes[remoteResource.name] ?? [];

              const getType = (type: GraphQLInputType) => {
                return isUnique || !isReferencee
                  ? type
                  : new GraphQLList(new GraphQLNonNull(type));
              };

              build.registerInputObjectType(
                relationshipTypeName,
                {
                  relationName,
                  isRelationInputType: true,
                },
                () => ({
                  assertStep: ObjectStep,
                  description: build.wrapDescription(
                    `Relationship input type for ${name}`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => ({
                    ...(fields.insertable
                      ? {
                          [fields.insertable.name]: fieldWithHooks(
                            {
                              fieldName: fields.insertable.name,
                              isRelationCreateField: true,
                            },
                            {
                              type: getType(
                                build.getInputTypeByName(fields.insertable.type)
                              ),
                              description: build.wrapDescription(
                                `A ${inflection.tableType(remoteResource.codec)} created and linked to this object`,
                                'type'
                              ),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (build, getNestedCreatePlanResolver, relation) =>
                                  getNestedCreatePlanResolver(build, relation),
                                [build, getNestedCreatePlanResolver, relation]
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
                              isRelationConnectNodeField: true,
                            },
                            {
                              description: build.wrapDescription(
                                `Connect ${remoteResource.name} by node id in the ${relationName} relationship`,
                                'field'
                              ),
                              type: getType(
                                build.getInputTypeByName(fields.connectable.byNodeId.type)
                              ),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (build, getNestedConnectByIdPlanResolver, relation) =>
                                  getNestedConnectByIdPlanResolver(build, relation),
                                [build, getNestedConnectByIdPlanResolver, relation]
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(fields.connectable.byKeys ? {} : {}),

                    ...(fields.updateable.byNodeId ? {} : {}),
                    ...(fields.updateable.byKeys ? {} : {}),

                    ...(fields.deletable.byNodeId ? {} : {}),
                    ...(fields.deletable.byKeys ? {} : {}),
                  }),
                }),
                `Creating input type for relationship ${relationName}`
              );
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
                const fieldName = inflection.relationInputField(relationship);
                const typeName = inflection.relationInputType(relationship);
                const InputType = build.getInputTypeByName(typeName);

                return {
                  ...memo,
                  [fieldName]: fieldWithHooks(
                    {
                      fieldName,
                      isRelationInputType: true,
                    },
                    () => ({
                      description: wrapDescription(
                        `Nested connector type for ${relationship.relationName}`,
                        'field'
                      ),
                      type: InputType,
                      autoApplyAfterParentApplyPlan: true,
                      applyPlan: EXPORTABLE(
                        (PgInsertSingleStep, PgUpdateSingleStep) =>
                          function plan(
                            $obj: SetterStep | PgInsertSingleStep | PgUpdateSingleStep,
                            fieldArgs: FieldArgs
                          ) {
                            if (
                              $obj instanceof PgInsertSingleStep ||
                              $obj instanceof PgUpdateSingleStep
                            ) {
                              fieldArgs.apply($obj);
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
              Object.keys(connectorFields)
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
        const {EXPORTABLE} = build;
        const {
          scope: {isRootMutation, fieldName},
        } = context;

        if (isRootMutation) {
          const resource = build.pgRootFieldNamesToCodec.get(fieldName);
          if (!resource) return field;
          const inputTypes = build.pgRelationshipInputTypes[resource.name] ?? [];
          const rootFields = build.pgRelationshipMutationRootFields.get(fieldName);
          if (!rootFields || !inputTypes) return field;

          return {
            ...field,
            plan: EXPORTABLE(
              (field, rootFields) =>
                function plan($parent: __TrackedValueStep, fieldArgs, info) {
                  if (!field.plan) return $parent;
                  const $object = field.plan($parent, fieldArgs, info);
                  const $insertSingle = $object.get('result');

                  rootFields.forEach((path) => {
                    fieldArgs.apply($insertSingle, path);
                  });

                  return $object;
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
  const fieldNames: string[] = [];
  const paths: string[][] = [];

  if (isInsertable(build, resource)) {
    fieldNames.push(build.inflection.createField(resource));
    paths.push(['input', build.inflection.tableFieldName(resource)]);
  }
  // if (isUpdateable(build, resource)) {
  //   fieldNames.push(
  //     build.inflection.patchField(build.inflection.tableFieldName(resource))
  //   );
  //   paths.push(['input', 'patch']);
  // }

  const allPaths = connectorFields.reduce((memo, connectorFieldName) => {
    return [...memo, ...paths.map((path) => [...path, connectorFieldName])];
  }, [] as string[][]);

  return fieldNames.reduce(
    (memo, fieldName) => ({...memo, [fieldName]: allPaths}),
    {} as Record<TFieldName, string[][]>
  );
};
