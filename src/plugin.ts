import {PgInsertSingleStep, PgUpdateSingleStep} from '@dataplan/pg';
import {
  type FieldArgs,
  type GrafastInputFieldConfigMap,
  type ModifierStep,
  ObjectStep,
  type SetterStep,
  type __TrackedValueStep,
} from 'grafast';
import {EXPORTABLE} from 'graphile-build';
import {
  type GraphQLInputFieldConfigMap,
  type GraphQLInputObjectType,
  type GraphQLInputType,
  GraphQLList,
  GraphQLNonNull,
} from 'graphql';
import type {PgTableResource, RelationshipInputFields} from './interfaces.ts';
import {getNestedConnectByIdPlanResolver} from './plans/connect-node.ts';
import {getNestedCreatePlanResolver} from './plans/create.ts';
import {type PgRelationInputData, getRelationships} from './relationships.ts';
import {rebuildObject} from './utils/object.ts';
import {
  isDeletable,
  isInsertable,
  isPgTableResource,
  isUpdatable,
} from './utils/resource.ts';

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
        return this.camelCase('create');
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
        const {inflection} = build;

        const relationshipInputTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          (resource) => isPgTableResource(resource)
        );

        for (const resource of tableResources) {
          const relationships = getRelationships(build, resource);

          build.pgRelationshipInputTypes[resource.name] = relationships;

          for (const relation of relationships) {
            const {isReferencee, isUnique, remoteResource, relationName} = relation;

            const relationshipTypeName = inflection.relationInputType(relation);

            if (relationshipInputTypes.has(relationshipTypeName)) {
              // console.log(`Skipping ${relationshipTypeName}: already exists`);
              continue;
            }
            relationshipInputTypes.add(relationshipTypeName);

            const insertable = isInsertable(build, remoteResource);
            const updateable = isUpdatable(build, remoteResource);
            const deletable = isDeletable(build, remoteResource);
            // for now, if you're updateable, you are connectable
            const connectable = updateable;

            const fields: RelationshipInputFields = {
              connect: {},
              delete: {},
              update: {},
            };

            if (insertable) {
              const name = inflection.relationCreateField(relation);
              const type = inflection.relationCreateInputType(relation);
              build.recoverable(null, () => {
                build.registerInputObjectType(
                  type,
                  {
                    isRelationCreateInputType: true,
                  },
                  () => ({
                    assertStep: ObjectStep,
                    description: build.wrapDescription(
                      `The ${inflection.tableType(
                        remoteResource.codec
                      )} to be created by this mutation.`,
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

                      return rebuildObject({
                        obj: (TableType as GraphQLInputObjectType).getFields(),
                        map: ([name, field]) => {
                          let type = field.type;
                          if (
                            isReferencee &&
                            primaryKeyAttrs.includes(name.toString()) &&
                            build.graphql.isNonNullType(type)
                          ) {
                            type = type.ofType;
                          }
                          return [
                            name,
                            fieldWithHooks({fieldName: name}, {...field, type}),
                          ];
                        },
                      }) as GrafastInputFieldConfigMap<Grafast.Context, ModifierStep>;
                    },
                  }),
                  `Add a relationship create input type for ${remoteResource.name} on ${relationName}`
                );

                fields.create = {name, type};
              });
            }

            if (updateable) {
              // const mode = "node";
              // if (mode === "node") {
              //   const updateByNode = {
              //     fieldName: inflection.relationUpdateNodeField(relation),
              //     typeName: inflection.relationUpdateNodeInputType(relation),
              //   };
              //   build.recoverable(null, () => {
              //     build.registerInputObjectType(
              //       updateByNode.typeName,
              //       { isRelationUpdateByNodeInputType: true },
              //       () => ({}),
              //       `Creating relationship update by node id input type for ${relationName} relationship`,
              //     );
              //   });
              // }
            }
            if (deletable) {
            }
            if (connectable) {
              // use update for now
              // const mode = getUniqueMode(build, remoteResource, 'update');
              const mode = 'node';

              if (mode === 'node') {
                const name = inflection.relationConnectNodeField(relation);
                const type = inflection.relationConnectNodeInputType(relation);
                build.recoverable(null, () => {
                  build.registerInputObjectType(
                    type,
                    {isRelationConnectNodeInputType: true},
                    () => ({
                      description: build.wrapDescription(
                        `Relationship connect by node id input field for ${remoteResource.name} in the ${relationName} relationship`,
                        'type'
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
                  fields.connect.byNodeId = {name, type};
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
                    `Relationship input type for ${relationName}`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => ({
                    ...(fields.create
                      ? {
                          [fields.create.name]: fieldWithHooks(
                            {
                              fieldName: fields.create.name,
                              isRelationCreateField: true,
                            },
                            {
                              type: getType(build.getInputTypeByName(fields.create.type)),
                              description: build.wrapDescription(
                                `A ${inflection.tableType(
                                  remoteResource.codec
                                )} created and linked to this object`,
                                'type'
                              ),
                              autoApplyAfterParentApplyPlan: true,
                              applyPlan: EXPORTABLE(
                                (build, getNestedCreatePlanResolver, relation) =>
                                  function plan(
                                    $parent: PgInsertSingleStep | PgUpdateSingleStep,
                                    args,
                                    info
                                  ) {
                                    getNestedCreatePlanResolver(build, relation)(
                                      $parent,
                                      args,
                                      info
                                    );
                                  },
                                [build, getNestedCreatePlanResolver, relation]
                              ),
                            }
                          ),
                        }
                      : {}),
                    ...(fields.connect.byNodeId
                      ? {
                          [fields.connect.byNodeId.name]: fieldWithHooks(
                            {
                              fieldName: fields.connect.byNodeId.name,
                              isRelationConnectNodeField: true,
                            },
                            {
                              description: build.wrapDescription(
                                `Connect ${remoteResource.name} by node id in the ${relationName} relationship`,
                                'field'
                              ),
                              type: getType(
                                build.getInputTypeByName(fields.connect.byNodeId.type)
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
                    ...(fields.connect.byKeys ? {} : {}),

                    ...(fields.update.byNodeId ? {} : {}),
                    ...(fields.update.byKeys ? {} : {}),

                    ...(fields.delete.byNodeId ? {} : {}),
                    ...(fields.delete.byKeys ? {} : {}),
                  }),
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
            const relationships = getRelationships(build, resource);
            const inputFields: GraphQLInputFieldConfigMap = {};

            for (const relationship of relationships) {
              const fieldName = inflection.relationInputField(relationship);
              const typeName = inflection.relationInputType(relationship);
              const InputType = build.getInputTypeByName(typeName);

              inputFields[fieldName] = fieldWithHooks(
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
              );
            }

            const rootFields = mapPgRelationshipRootFields(
              build,
              resource,
              Object.keys(inputFields)
            );

            for (const [fieldName, paths] of Object.entries(rootFields)) {
              build.pgRelationshipMutationRootFields.set(fieldName, paths);
              build.pgRootFieldNamesToCodec.set(fieldName, resource);
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

      GraphQLObjectType_fields_field(field, build, context) {
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
                  const $object = field.plan($parent, fieldArgs, info) as ObjectStep;
                  const $insertSingle = $object.get('result');

                  for (const path of rootFields) {
                    fieldArgs.apply($insertSingle, path);
                  }

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
    memo.push(...paths.map((path) => [...path, connectorFieldName]));
    return memo;
  }, [] as string[][]);

  return Object.fromEntries(
    fieldNames.map((fieldName) => [fieldName, allPaths])
  ) as Record<TFieldName, string[][]>;
};
