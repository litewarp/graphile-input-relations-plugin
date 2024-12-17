import {ObjectStep} from 'grafast';
import {GraphQLID, type GraphQLInputObjectType, GraphQLNonNull} from 'graphql';
import type {PgResourceUnique} from 'postgraphile/@dataplan/pg';
import type {PgRelationInputData, PgTableResource} from '../interfaces.ts';
import {getRelationships} from '../relationships.ts';
import {
  getSpecs,
  isInsertable,
  isPgTableResource,
  isUpdatable,
} from '../utils/resource.ts';

const inputMethods = [
  'create',
  'connect',
  'disconnect',
  'update',
  'delete',
] as const;

const idModes = ['node', 'keys'] as const;

type RelationInputMethod = (typeof inputMethods)[number];
type RelationInputIdMode = (typeof idModes)[number];

type ResourceRelationInputsFieldInfo<
  TMethod extends RelationInputMethod = RelationInputMethod,
  TMode extends RelationInputIdMode | null = RelationInputIdMode | null,
> = TMethod extends 'create'
  ? {
      fieldName: string;
      typeName: string;
      method: 'create';
      mode: null;
    }
  : {
      fieldName: string;
      typeName: string;
      method: TMethod;
      mode: TMode;
      unique: PgResourceUnique;
    };

declare global {
  namespace GraphileBuild {
    interface Build {
      pgRelationshipMutationRootFields: Map<string, string[][]>;
      pgRootFieldNamesToCodec: Map<string, PgTableResource>;
      pgRelationInputsFields: Record<string, ResourceRelationInputsFieldInfo[]>;
      pgRelationInputsTypes: Record<string, PgRelationInputData[]>;
    }
    interface Inflection {
      relationCreateField(this: Inflection, resource: PgTableResource): string;
      relationCreateInputType(
        this: Inflection,
        resource: PgTableResource
      ): string;
      relationNodeInputField(
        this: Inflection,
        details: {resource: PgTableResource; method: RelationInputMethod}
      ): string;
      relationNodeInputType(
        this: Inflection,
        details: {
          resource: PgTableResource;
          method: RelationInputMethod;
        }
      ): string;
      relationKeysInputField(
        this: Inflection,
        details: {
          resource: PgTableResource;
          method: RelationInputMethod;
          unique: PgResourceUnique;
        }
      ): string;
      relationKeysInputType(
        this: Inflection,
        details: {
          resource: PgTableResource;
          method: RelationInputMethod;
          unique: PgResourceUnique;
        }
      ): string;
    }
    interface ScopeInputObject {
      isRelationCreateInputType?: boolean;
      isRelationConnectByNodeInputType?: boolean;
      isRelationConnectByKeysInputType?: boolean;
      isRelationDisconnectByNodeInputType?: boolean;
      isRelationDisconnectByKeysInputType?: boolean;
      isRelationUpdateByNodeInputType?: boolean;
      isRelationUpdateByKeysInputType?: boolean;
      isRelationDeleteByNodeInputType?: boolean;
      isRelationDeleteByKeysInputType?: boolean;
    }
  }
}

export const PgRelationInputsResourceFieldsPlugin: GraphileConfig.Plugin = {
  name: 'PgRelationInputsResourceFieldsPlugin',
  description: 'Creates relation mutation types for resource',
  version: '0.0.1',
  after: [
    'smart-tags',
    'PgFakeConstraintsPlugin',
    'PgTablesPlugin',
    'PgRelationsPlugin',
  ],
  experimental: true,

  inflection: {
    add: {
      relationCreateField(_options, resource) {
        const tableName = this.tableFieldName(resource);
        return this.camelCase(`create-${tableName}`);
      },
      relationCreateInputType(_options, {codec}) {
        const tableType = this.tableType(codec);
        return this.upperCamelCase(`${tableType}-relation-create-input`);
      },
      relationNodeInputField(_options, {method}) {
        return this.camelCase(`${method}-by-node-id`);
      },
      relationNodeInputType(_options, {method, resource}) {
        return this.upperCamelCase(
          `${method}-${this.tableType(resource.codec)}-by-node-id-input`
        );
      },
      relationKeysInputField(_options, {method, resource, unique}) {
        return this.camelCase(
          `${method}-by-${this._joinAttributeNames(resource.codec, unique.attributes)}`
        );
      },
      relationKeysInputType(_options, {method, resource, unique}) {
        return this.upperCamelCase(
          `${method}-${this.tableType(resource.codec)}-relation-by-${this._joinAttributeNames(resource.codec, unique.attributes)}-input`
        );
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        build.pgRelationshipMutationRootFields = new Map();
        build.pgRootFieldNamesToCodec = new Map();
        build.pgRelationInputsTypes = {};
        build.pgRelationInputsFields = {};

        return build;
      },

      init(_, build) {
        const {inflection} = build;

        const tableResources = Object.values(
          build.input.pgRegistry.pgResources
        ).filter((resource) => isPgTableResource(resource));

        for (const resource of tableResources) {
          const relationships = getRelationships(build, resource);

          build.pgRelationInputsFields[resource.name] = [];
          build.pgRelationInputsTypes[resource.name] = relationships;

          // create the insert type if possible
          if (isInsertable(build, resource)) {
            const fieldName = inflection.relationCreateField(resource);
            const typeName = inflection.relationCreateInputType(resource);
            build.pgRootFieldNamesToCodec.set(fieldName, resource);
            build.recoverable(null, () => {
              build.registerInputObjectType(
                typeName,
                {
                  isRelationCreateInputType: true,
                },
                () => ({
                  assertStep: ObjectStep,
                  description: build.wrapDescription(
                    `The ${inflection.tableType(
                      resource.codec
                    )} to be created by this mutation.`,
                    'type'
                  ),
                  fields: ({fieldWithHooks}) => {
                    const TableType = build.getGraphQLTypeByPgCodec(
                      resource.codec,
                      'input'
                    );
                    const primaryKeyAttrs = resource.uniques
                      .find((u) => u.isPrimary)
                      ?.attributes.map((a) =>
                        inflection.attribute({
                          attributeName: a,
                          codec: resource.codec,
                        })
                      );
                    return Object.fromEntries(
                      Object.entries(
                        (TableType as GraphQLInputObjectType).getFields()
                      ).map(([name, field]) => {
                        let type = field.type;
                        if (
                          primaryKeyAttrs?.includes(name.toString()) &&
                          build.graphql.isNonNullType(type)
                        ) {
                          type = type.ofType;
                        }

                        return [
                          name,
                          fieldWithHooks(
                            {fieldName: name},
                            // remove existing grafast plans
                            {
                              ...field,
                              type,
                              extensions: {},
                            }
                          ),
                        ];
                      })
                    );
                  },
                }),
                `Add a relationship create input type for ${resource.name}`
              );
              build.pgRelationInputsFields[resource.name].push({
                fieldName,
                typeName,
                method: 'create',
                mode: null,
              });
            });

            // create the update / connect / disconnect fields if possible
            if (isUpdatable(build, resource)) {
              const specs = getSpecs(build, resource, 'resource:update');
              for (const spec of specs) {
                const {unique, uniqueMode} = spec;
                for (const method of [
                  'update',
                  'connect',
                  'disconnect',
                ] as const) {
                  const fieldName =
                    uniqueMode === 'node'
                      ? inflection.relationNodeInputField({resource, method})
                      : inflection.relationKeysInputField({
                          resource,
                          method,
                          unique,
                        });
                  const typeName =
                    uniqueMode === 'node'
                      ? inflection.relationNodeInputType({resource, method})
                      : inflection.relationKeysInputType({
                          resource,
                          method,
                          unique,
                        });

                  const nodeField =
                    uniqueMode === 'node' ? inflection.nodeIdFieldName() : null;

                  build.recoverable(null, () => {
                    build.registerInputObjectType(
                      typeName,
                      {
                        isRelationConnectNodeInputType:
                          method === 'connect' && uniqueMode === 'node',
                        isRelationConnectByKeysInputType:
                          method === 'connect' && uniqueMode === 'keys',
                        isRelationDisconnectByNodeInputType:
                          method === 'disconnect' && uniqueMode === 'node',
                        isRelationDisconnectByKeysInputType:
                          method === 'disconnect' && uniqueMode === 'keys',
                        isRelationUpdateByNodeInputType:
                          method === 'update' && uniqueMode === 'node',
                        isRelationUpdateByKeysInputType:
                          method === 'update' && uniqueMode === 'keys',
                      },
                      () => ({
                        fields: ({fieldWithHooks}) => {
                          let fields =
                            uniqueMode === 'node'
                              ? nodeField
                                ? {
                                    [nodeField]: fieldWithHooks(
                                      {fieldName: nodeField},
                                      {
                                        type: new GraphQLNonNull(GraphQLID),
                                        description: build.wrapDescription(
                                          `The globally unique \`ID\` which will identify a single \`${inflection.tableType(resource.codec)}\` to be ${method}ed.`,
                                          'field'
                                        ),
                                      }
                                    ),
                                  }
                                : {}
                              : Object.fromEntries(
                                  unique.attributes.map((attributeName) => {
                                    const fieldName = inflection.attribute({
                                      attributeName,
                                      codec: resource.codec,
                                    });
                                    const {codec, description} =
                                      resource.codec.attributes[attributeName];
                                    const type = build.getGraphQLTypeByPgCodec(
                                      codec,
                                      'input'
                                    );
                                    if (!type) {
                                      throw new Error(
                                        `Could not determine input type for ${fieldName}`
                                      );
                                    }
                                    return [
                                      fieldName,
                                      fieldWithHooks(
                                        {fieldName},
                                        {
                                          description,
                                          type: new GraphQLNonNull(type),
                                        }
                                      ),
                                    ];
                                  })
                                );

                          if (method === 'update') {
                            const patchField = inflection.patchField(
                              inflection.tableType(resource.codec)
                            );
                            const patchType = build.getGraphQLTypeByPgCodec(
                              resource.codec,
                              'patch'
                            );
                            if (patchType) {
                              fields = build.extend(
                                fields,
                                {
                                  [patchField]: fieldWithHooks(
                                    {fieldName: patchField},
                                    {
                                      type: new GraphQLNonNull(patchType),
                                      description: build.wrapDescription(
                                        `An relation in put object with updatable attributes for ${inflection.tableType(resource.codec)}`,
                                        'field'
                                      ),
                                    }
                                  ),
                                },
                                `Adding patch field for relation update by ${uniqueMode === 'node' ? 'node' : `keys (${unique.attributes.join(', ')})`} for ${resource.name}`
                              );
                            }
                          }
                          return fields;
                        },
                      }),
                      `Add a ${method} by ${uniqueMode === 'node' ? 'node' : `keys (${unique.attributes.join(', ')})`} input type for ${resource.name}`
                    );
                    build.pgRelationInputsFields[resource.name].push({
                      fieldName,
                      typeName,
                      method,
                      mode: uniqueMode === 'node' ? 'node' : 'keys',
                      unique,
                    });
                  });
                }
              }
            }
          }
        }
        return _;
      },
    },
  },
};
