import type {} from '@dataplan/pg';
import {GraphQLNonNull} from 'graphql';
import type {} from 'postgraphile/graphile-build';
import type {PgRelationInputData, RelationInputTypeInfo} from './interfaces.ts';
import {
  isDeletable,
  isNodeIdSpec,
  isPgTableResource,
  isUpdatable,
} from './utils/resource.ts';

declare global {
  namespace GraphileBuild {
    interface Inflection {
      relationConnectNodeField(
        this: Inflection,
        relationship: PgRelationInputData,
        disconnect?: boolean
      ): string;
      relationConnectNodeInputType(
        this: Inflection,
        relationship: PgRelationInputData,
        disconnect?: boolean
      ): string;
      relationConnectByKeysField(
        this: Inflection,
        relationship: PgRelationInputData,
        disconnect?: boolean
      ): string;
      relationConnectByKeysInputType(
        this: Inflection,
        relationship: PgRelationInputData,
        disconnect?: boolean
      ): string;
      relationDeleteNodeField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationDeleteNodeInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationDeleteByKeysField(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
      relationDeleteByKeysInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
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
      relationConnectNodeField(_options, _relationship, disconnect) {
        const action = disconnect ? 'disconnect' : 'connect';
        return this.camelCase(`${action}-by-${this.nodeIdFieldName()}`);
      },
      relationConnectNodeInputType(_options, {relationName}, disconnect) {
        const action = disconnect ? 'disconnect' : 'connect';
        return this.upperCamelCase(`${relationName}-${action}-by-node-id-input`);
      },
      relationConnectByKeysField(_options, {remoteAttributes}, disconnect) {
        const action = disconnect ? 'disconnect' : 'connect';
        const attrs = remoteAttributes.map((a) => a.name);
        return this.camelCase(`${action}-by-${attrs.join('-and-')}`);
      },
      relationConnectByKeysInputType(
        _options,
        {relationName, remoteAttributes},
        disconnect
      ) {
        const action = disconnect ? 'disconnect' : 'connect';
        const attrs = remoteAttributes.map((a) => a.name);
        return this.upperCamelCase(
          `${relationName}-${action}-by-${attrs.join('-and-')}-input`
        );
      },
      relationUpdateNodeField(_options, _relationship) {
        return this.camelCase(`update-by-${this.nodeIdFieldName()}`);
      },
      relationUpdateNodeInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-update-by-node-id-input`);
      },
      relationUpdateByKeysField(_options, {remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.camelCase(`update-by-${attrs.join('-and-')}`);
      },
      relationUpdateByKeysInputType(_options, {relationName, remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.upperCamelCase(
          `${relationName}-update-by-${attrs.join('-and-')}-input`
        );
      },
      relationDeleteNodeField(_options, _relationship) {
        return this.camelCase(`delete-by-${this.nodeIdFieldName()}`);
      },
      relationDeleteNodeInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-delete-by-node-id-input`);
      },
      relationDeleteByKeysField(_options, {remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.camelCase(`delete-by-${attrs.join('-and-')}`);
      },
      relationDeleteByKeysInputType(_options, {relationName, remoteAttributes}) {
        const attrs = remoteAttributes.map((a) => a.name);
        return this.upperCamelCase(
          `${relationName}-delete-by-${attrs.join('-and-')}-input`
        );
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

              const nodeIdSpec = isNodeIdSpec(
                build,
                remoteResource,
                // until behaviors are implemented, connect === update
                `resource:${method === 'delete' ? 'delete' : 'update'}`
              );

              if (nodeIdSpec) {
                const nodeIdFieldName = inflection.nodeIdFieldName();
                const fieldName =
                  method === 'connect'
                    ? inflection.relationConnectNodeField(relation)
                    : method === 'delete'
                      ? inflection.relationDeleteNodeField(relation)
                      : inflection.relationUpdateNodeField(relation);

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
                  const fieldName = inflection.relationConnectNodeField(relation, true);
                  const typeName = inflection.relationConnectNodeInputType(
                    relation,
                    true
                  );
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
              }

              const fieldName =
                method === 'connect'
                  ? inflection.relationConnectByKeysField(relation)
                  : method === 'delete'
                    ? inflection.relationDeleteByKeysField(relation)
                    : inflection.relationUpdateByKeysField(relation);

              const typeName =
                method === 'connect'
                  ? inflection.relationConnectByKeysInputType(relation)
                  : method === 'delete'
                    ? inflection.relationDeleteByKeysInputType(relation)
                    : inflection.relationUpdateByKeysInputType(relation);

              // check to see if the only key is "rowId" and skip if so
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
                                  type: build.getGraphQLTypeByPgCodec(a.codec, 'input'),
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
                      const fieldName = inflection.relationConnectByKeysField(
                        relation,
                        true
                      );
                      const typeName = inflection.relationConnectByKeysInputType(
                        relation,
                        true
                      );

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
        return _;
      },
    },
  },
};
