import type {PgResourceUnique} from '@dataplan/pg';
import {GraphQLNonNull} from 'graphql';
import type {} from 'postgraphile/graphile-build';
import type {PgTableResource, RelationInputTypeInfo} from './interfaces.ts';
import {getSpecs, isDeletable, isPgTableResource, isUpdatable} from './utils/resource.ts';

interface RelationInflectionInfo {
  disconnect?: boolean;
  remoteResource: PgTableResource;
  unique: PgResourceUnique;
  relationName: string;
}

declare global {
  namespace GraphileBuild {
    interface Inflection {
      relationConnectNodeField(
        this: Inflection,
        details: Omit<RelationInflectionInfo, 'unique'>
      ): string;
      relationConnectNodeInputType(
        this: Inflection,
        details: Omit<RelationInflectionInfo, 'unique'>
      ): string;
      relationDeleteNodeField(this: Inflection, details?: RelationInflectionInfo): string;
      relationDeleteNodeInputType(
        this: Inflection,
        details: Omit<RelationInflectionInfo, 'unique'>
      ): string;
      relationUpdateNodeField(this: Inflection, details?: RelationInflectionInfo): string;
      relationUpdateNodeInputType(
        this: Inflection,
        details: Omit<RelationInflectionInfo, 'unique'>
      ): string;

      relationConnectByKeysField(
        this: Inflection,
        details: RelationInflectionInfo
      ): string;
      relationConnectByKeysInputType(
        this: Inflection,
        details: RelationInflectionInfo
      ): string;
      relationDeleteByKeysField(
        this: Inflection,
        details: RelationInflectionInfo
      ): string;
      relationDeleteByKeysInputType(
        this: Inflection,
        details: RelationInflectionInfo
      ): string;
      relationUpdateByKeysField(
        this: Inflection,
        relationship: RelationInflectionInfo
      ): string;
      relationUpdateByKeysInputType(
        this: Inflection,
        relationship: RelationInflectionInfo
      ): string;
    }
    interface ScopeInputObject {
      isRelationConnectNodeInputType?: boolean;
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

export const PgRelationInputsConnectUpdateDeletePlugin: GraphileConfig.Plugin = {
  name: 'PgRelationInputsConnectUpdateDeletePlugin',
  description: 'Adds input types for connecting, updating, and deleting relationships',
  version: '0.0.1',
  after: ['PgRelationInputsInitCreatePlugin'],
  experimental: true,

  inflection: {
    add: {
      relationConnectNodeField(_options, {disconnect}) {
        const action = disconnect ? 'disconnect' : 'connect';
        return this.camelCase(`${action}-by-${this.nodeIdFieldName()}`);
      },
      relationConnectNodeInputType(_options, {relationName, disconnect}) {
        const action = disconnect ? 'disconnect' : 'connect';
        return this.upperCamelCase(`${relationName}-${action}-by-node-id-input`);
      },
      relationConnectByKeysField(_options, {remoteResource, disconnect, unique}) {
        const action = disconnect ? 'disconnect' : 'connect';
        return this.camelCase(
          `${action}-by-${this._joinAttributeNames(remoteResource.codec, unique.attributes)}`
        );
      },
      relationConnectByKeysInputType(_options, details) {
        return this.upperCamelCase(`${this.relationConnectByKeysField(details)}-input`);
      },
      relationUpdateNodeField(_options) {
        return this.camelCase(`update-by-${this.nodeIdFieldName()}`);
      },
      relationUpdateNodeInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-update-by-node-id-input`);
      },
      relationUpdateByKeysField(_options, {remoteResource, unique}) {
        return this.camelCase(
          `update-by-${this._joinAttributeNames(remoteResource.codec, unique.attributes)}`
        );
      },
      relationUpdateByKeysInputType(_options, details) {
        return this.upperCamelCase(`${this.relationUpdateByKeysField(details)}-input`);
      },
      relationDeleteNodeField(_options) {
        return this.camelCase(`delete-by-${this.nodeIdFieldName()}`);
      },
      relationDeleteNodeInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-delete-by-node-id-input`);
      },
      relationDeleteByKeysField(_options, {remoteResource, unique}) {
        return this.camelCase(
          `delete-by-${this._joinAttributeNames(remoteResource.codec, unique.attributes)}`
        );
      },
      relationDeleteByKeysInputType(_options, details) {
        return this.upperCamelCase(`${this.relationDeleteByKeysField(details)}-input`);
      },
    },
  },

  schema: {
    hooks: {
      init(_, build) {
        const {inflection} = build;

        const duplicateTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          (resource) => isPgTableResource(resource)
        );

        for (const resource of tableResources) {
          const relationships = build.pgRelationInputsTypes[resource.name] ?? [];

          const resourceRelationInputs: RelationInputTypeInfo[] = [];

          for (const relation of relationships) {
            const {isReferencee, remoteResource, relationName, remoteAttributes} =
              relation;

            const methods = ['connect', 'update', 'delete'] as const;

            for (const method of methods) {
              // for now, if you're updateable, you are connectable
              const isPermitted =
                method === 'delete'
                  ? isDeletable(build, resource)
                  : isUpdatable(build, resource);

              if (!isPermitted) continue;

              // check to see if the foreign key is on the local resource
              // if so, we need to make sure that the local resource is updatable
              if (!isReferencee && !isUpdatable(build, resource)) {
                throw new Error(
                  `Can't add ${method} field for ${relationName} relation because the ${resource.name} resource is not updatable.`
                );
              }
              const specs = getSpecs(
                build,
                remoteResource,
                `resource:${method === 'delete' ? 'delete' : 'update'}`
              );
              for (const spec of specs) {
                if (spec.uniqueMode === 'node') {
                  const nodeIdFieldName = inflection.nodeIdFieldName();
                  const fieldName =
                    method === 'connect'
                      ? inflection.relationConnectNodeField(relation)
                      : method === 'delete'
                        ? inflection.relationDeleteNodeField()
                        : inflection.relationUpdateNodeField();

                  const typeName =
                    method === 'connect'
                      ? inflection.relationConnectNodeInputType(relation)
                      : method === 'delete'
                        ? inflection.relationDeleteNodeInputType(relation)
                        : inflection.relationUpdateNodeInputType(relation);

                  if (!duplicateTypes.has(typeName)) {
                    duplicateTypes.add(typeName);
                    build.recoverable(null, () => {
                      build.registerInputObjectType(
                        typeName,
                        {
                          isRelationConnectNodeInputType: method === 'connect',
                          isRelationDeleteByNodeInputType: method === 'delete',
                          isRelationUpdateByNodeInputType: method === 'update',
                        },
                        () => ({
                          description: build.wrapDescription(
                            `Relationship ${method} by node id input field for ${remoteResource.name} in the ${relationName} relationship`,
                            'type'
                          ),
                          fields: ({fieldWithHooks}) => ({
                            [nodeIdFieldName]: fieldWithHooks(
                              {fieldName: nodeIdFieldName},
                              () => ({
                                description: build.wrapDescription(
                                  `The node id input field to ${method} ${remoteResource.name} in the ${relationName} relationship`,
                                  'field'
                                ),
                                type: new GraphQLNonNull(build.graphql.GraphQLID),
                              })
                            ),
                          }),
                        }),
                        `Creating relationship ${method} by node id input type for ${relationName} relationship`
                      );
                      resourceRelationInputs.push({
                        fieldName,
                        typeName,
                        relationName,
                        method,
                        mode: 'node',
                      });
                    });
                  }

                  if (method === 'connect') {
                    // add a disconnect by node id field
                    const fieldName = inflection.relationConnectNodeField({
                      ...relation,
                      disconnect: true,
                    });
                    const typeName = inflection.relationConnectNodeInputType({
                      ...relation,
                      disconnect: true,
                    });
                    if (!duplicateTypes.has(typeName)) {
                      duplicateTypes.add(typeName);
                      // add a disconnect by node id field
                      build.recoverable(null, () => {
                        build.registerInputObjectType(
                          typeName,
                          {isRelationDisconnectByNodeInputType: true},
                          () => ({
                            description: build.wrapDescription(
                              `Relationship disconnect by node id input field for ${remoteResource.name} in the ${relationName} relationship`,
                              'type'
                            ),
                            fields: ({fieldWithHooks}) => ({
                              [nodeIdFieldName]: fieldWithHooks(
                                {fieldName: nodeIdFieldName},
                                () => ({
                                  description: build.wrapDescription(
                                    `The node id input field to disconnect ${remoteResource.name} in the ${relationName} relationship`,
                                    'field'
                                  ),
                                  type: new GraphQLNonNull(build.graphql.GraphQLID),
                                })
                              ),
                            }),
                          }),
                          `Creating relationship disconnect by node id input type for ${relationName} relationship`
                        );
                        resourceRelationInputs.push({
                          fieldName,
                          typeName,
                          relationName,
                          method,
                          mode: 'node',
                        });
                      });
                    }
                  }
                } else if (spec.uniqueMode === 'keys') {
                  const inflectionInfo = {...relation, unique: spec.unique};
                  const fieldName =
                    method === 'connect'
                      ? inflection.relationConnectByKeysField(inflectionInfo)
                      : method === 'delete'
                        ? inflection.relationDeleteByKeysField(inflectionInfo)
                        : inflection.relationUpdateByKeysField(inflectionInfo);

                  const typeName =
                    method === 'connect'
                      ? inflection.relationConnectByKeysInputType(inflectionInfo)
                      : method === 'delete'
                        ? inflection.relationDeleteByKeysInputType(inflectionInfo)
                        : inflection.relationUpdateByKeysInputType(inflectionInfo);

                  const isRowIdOnly =
                    remoteAttributes.length === 1 &&
                    inflection.attribute({
                      attributeName: remoteAttributes[0].name,
                      codec: remoteResource.codec,
                    }) === 'rowId';

                  if (!isRowIdOnly && !duplicateTypes.has(typeName)) {
                    duplicateTypes.add(typeName);

                    build.recoverable(null, () => {
                      build.registerInputObjectType(
                        typeName,
                        {
                          isRelationUpdateByKeysInputType: method === 'update',
                          isRelationDeleteByKeysInputType: method === 'delete',
                          isRelationConnectByKeysInputType: method === 'connect',
                        },
                        () => ({
                          description: build.wrapDescription(
                            `Relationship ${method} by keys (${remoteAttributes.map((a) => a.name).join(', ')}) input field for ${remoteResource.name} in the ${relationName} relationship`,
                            'type'
                          ),
                          fields: ({fieldWithHooks}) => {
                            return Object.fromEntries(
                              remoteAttributes.map((a) => {
                                const fieldName = inflection.attribute({
                                  attributeName: a.name,
                                  codec: remoteResource.codec,
                                });
                                return [
                                  fieldName,
                                  fieldWithHooks(
                                    {fieldName},
                                    {
                                      description: build.wrapDescription(
                                        `The ${a.name} input field to ${method} ${remoteResource.name} in the ${relationName} relationship`,
                                        'field'
                                      ),
                                      type: build.getGraphQLTypeByPgCodec(
                                        a.codec,
                                        'input'
                                      ),
                                    }
                                  ),
                                ];
                              })
                            );
                          },
                        }),
                        `Creating relationship ${method} by keys (${remoteAttributes.map((a) => a.name).join(', ')}) input type for ${relationName} relationship`
                      );

                      resourceRelationInputs.push({
                        fieldName,
                        typeName,
                        relationName,
                        method,
                        mode: 'keys',
                      });

                      if (method === 'connect') {
                        // add a disconnect by keys field
                        build.recoverable(null, () => {
                          const fieldName = inflection.relationConnectByKeysField({
                            ...relation,
                            disconnect: true,
                            unique: spec.unique,
                          });
                          const typeName = inflection.relationConnectByKeysInputType({
                            ...relation,
                            disconnect: true,
                            unique: spec.unique,
                          });

                          build.registerInputObjectType(
                            typeName,
                            {
                              isRelationDisconnectByKeysInputType: true,
                            },
                            () => ({
                              description: build.wrapDescription(
                                `Relationship disconnect by keys (${remoteAttributes.map((a) => a.name).join(', ')}) input field for ${remoteResource.name} in the ${relationName} relationship`,
                                'type'
                              ),
                              fields: ({fieldWithHooks}) => {
                                return Object.fromEntries(
                                  remoteAttributes.map((a) => {
                                    const fieldName = inflection.attribute({
                                      attributeName: a.name,
                                      codec: remoteResource.codec,
                                    });
                                    return [
                                      fieldName,
                                      fieldWithHooks(
                                        {fieldName},
                                        {
                                          description: build.wrapDescription(
                                            `The ${a.name} input field to disconnect ${remoteResource.name} in the ${relationName} relationship`,
                                            'field'
                                          ),
                                          type: build.getGraphQLTypeByPgCodec(
                                            a.codec,
                                            'input'
                                          ),
                                        }
                                      ),
                                    ];
                                  })
                                );
                              },
                            }),
                            `Creating relationship disconnect by keys (${remoteAttributes.map((a) => a.name).join(', ')}) input type for ${relationName} relationship`
                          );
                          resourceRelationInputs.push({
                            fieldName,
                            typeName,
                            relationName,
                            method,
                            mode: 'keys',
                          });
                        });
                      }
                    });
                  }
                }
                build.pgRelationInputsFields[resource.name] = [
                  ...build.pgRelationInputsFields[resource.name],
                  ...resourceRelationInputs,
                ];
              }
            }
          }
        }
        return _;
      },
    },
  },
};
