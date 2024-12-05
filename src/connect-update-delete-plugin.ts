import type {PgResourceUnique} from '@dataplan/pg';
import {GraphQLID, GraphQLNonNull} from 'graphql';
import type {} from 'postgraphile/graphile-build';
import type {} from 'postgraphile/graphile-build-pg/pg-introspection';
import type {PgTableResource, RelationInputTypeInfo} from './interfaces.ts';
import {
  getSpecs,
  isDeletable,
  isPgTableResource,
  isUpdatable,
} from './utils/resource.ts';

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
      relationDeleteNodeField(
        this: Inflection,
        details?: RelationInflectionInfo
      ): string;
      relationDeleteNodeInputType(
        this: Inflection,
        details: Omit<RelationInflectionInfo, 'unique'>
      ): string;
      relationUpdateNodeField(
        this: Inflection,
        details?: RelationInflectionInfo
      ): string;
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

export const PgRelationInputsConnectUpdateDeletePlugin: GraphileConfig.Plugin =
  {
    name: 'PgRelationInputsConnectUpdateDeletePlugin',
    description:
      'Adds input types for connecting, updating, and deleting relationships',
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
          return this.upperCamelCase(
            `${relationName}-${action}-by-node-id-input`
          );
        },
        relationConnectByKeysField(
          _options,
          {remoteResource, disconnect, unique}
        ) {
          const action = disconnect ? 'disconnect' : 'connect';
          return this.camelCase(
            `${action}-by-${this._joinAttributeNames(remoteResource.codec, unique.attributes)}`
          );
        },
        relationConnectByKeysInputType(_options, details) {
          return this.upperCamelCase(
            `${this.relationConnectByKeysField(details)}-input`
          );
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
          return this.upperCamelCase(
            `${this.relationUpdateByKeysField(details)}-input`
          );
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
          return this.upperCamelCase(
            `${this.relationDeleteByKeysField(details)}-input`
          );
        },
      },
    },

    schema: {
      hooks: {
        init(_, build) {
          const {inflection} = build;

          const duplicateTypes = new Set<string>();

          const tableResources = Object.values(
            build.input.pgRegistry.pgResources
          ).filter(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            (resource) => isPgTableResource(resource)
          );

          for (const resource of tableResources) {
            const relationships =
              build.pgRelationInputsTypes[resource.name] ?? [];

            const resourceRelationInputs: RelationInputTypeInfo[] = [];

            for (const relation of relationships) {
              const {isReferencee, remoteResource, relationName} = relation;

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
                  const {unique, uniqueMode} = spec;

                  const nodeIdFieldName =
                    uniqueMode === 'node' ? inflection.nodeIdFieldName() : null;
                  const details = {...relation, unique};
                  const fieldName =
                    method === 'connect'
                      ? uniqueMode === 'node'
                        ? inflection.relationConnectNodeField(details)
                        : inflection.relationConnectByKeysField(details)
                      : method === 'delete'
                        ? uniqueMode === 'node'
                          ? inflection.relationDeleteNodeField(details)
                          : inflection.relationDeleteByKeysField(details)
                        : uniqueMode === 'node'
                          ? inflection.relationUpdateNodeField()
                          : inflection.relationUpdateByKeysField(details);
                  const typeName =
                    method === 'connect'
                      ? uniqueMode === 'node'
                        ? inflection.relationConnectNodeInputType(details)
                        : inflection.relationConnectByKeysInputType(details)
                      : method === 'delete'
                        ? uniqueMode === 'node'
                          ? inflection.relationDeleteNodeInputType(details)
                          : inflection.relationDeleteByKeysInputType(details)
                        : uniqueMode === 'node'
                          ? inflection.relationUpdateNodeInputType(details)
                          : inflection.relationUpdateByKeysInputType(details);

                  if (duplicateTypes.has(typeName)) {
                    resourceRelationInputs.push({
                      fieldName,
                      typeName,
                      relationName,
                      method,
                      unique,
                      mode: uniqueMode === 'node' ? 'node' : 'keys',
                    });
                  } else {
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
                          fields: ({fieldWithHooks}) => {
                            let fields =
                              spec.uniqueMode === 'node' && nodeIdFieldName
                                ? {
                                    [nodeIdFieldName]: fieldWithHooks(
                                      {
                                        fieldName: nodeIdFieldName,
                                      },
                                      {
                                        description: build.wrapDescription(
                                          `The globally unique \`ID\` which will identify a single \`${inflection.tableType(remoteResource.codec)}\` to be ${method}ed.`,
                                          'field'
                                        ),
                                        type: new GraphQLNonNull(GraphQLID),
                                      }
                                    ),
                                  }
                                : Object.fromEntries(
                                    spec.unique.attributes.map((attr) => {
                                      const fieldName = inflection.attribute({
                                        attributeName: attr,
                                        codec: remoteResource.codec,
                                      });
                                      const attribute =
                                        remoteResource.codec.attributes[attr];
                                      const fieldType =
                                        build.getGraphQLTypeByPgCodec(
                                          attribute.codec,
                                          'input'
                                        );
                                      if (!fieldType) {
                                        throw new Error(
                                          `Could not find field type for ${attr}`
                                        );
                                      }
                                      return [
                                        fieldName,
                                        fieldWithHooks(
                                          {fieldName},
                                          {
                                            description: attribute.description,
                                            type: new GraphQLNonNull(fieldType),
                                          }
                                        ),
                                      ];
                                    })
                                  );

                            if (method === 'update') {
                              // find the patch field
                              const tablePatchName =
                                build.getGraphQLTypeNameByPgCodec(
                                  remoteResource.codec,
                                  'patch'
                                );
                              if (tablePatchName) {
                                const fieldName = inflection.patchField(
                                  inflection.tableType(remoteResource.codec)
                                );
                                fields = build.extend(
                                  fields,
                                  {
                                    [fieldName]: fieldWithHooks(
                                      {
                                        fieldName,
                                      },
                                      {
                                        description: build.wrapDescription(
                                          `An object where the defined keys will be updated on the \`${inflection.tableType(remoteResource.codec)}\` being ${method}ed.`,
                                          'field'
                                        ),
                                        type: new GraphQLNonNull(
                                          build.getInputTypeByName(
                                            tablePatchName
                                          )
                                        ),
                                      }
                                    ),
                                  },
                                  `Adding patch field to relation update input type for ${relationName} relationship`
                                );
                              }
                            }
                            return fields;
                          },
                        }),
                        `Creating relationship ${method} by node id input type for ${relationName} relationship`
                      );
                      resourceRelationInputs.push({
                        fieldName,
                        typeName,
                        relationName,
                        method,
                        unique,
                        mode: uniqueMode === 'node' ? 'node' : 'keys',
                      });
                    });
                  }

                  if (method === 'connect') {
                    // add a disconnect by node id field
                    const fieldName =
                      uniqueMode === 'node'
                        ? inflection.relationConnectNodeField({
                            ...details,
                            disconnect: true,
                          })
                        : inflection.relationConnectByKeysField({
                            ...details,
                            disconnect: true,
                          });

                    const typeName =
                      uniqueMode === 'node'
                        ? inflection.relationConnectNodeInputType({
                            ...details,
                            disconnect: true,
                          })
                        : inflection.relationConnectByKeysInputType({
                            ...details,
                            disconnect: true,
                          });
                    if (!duplicateTypes.has(typeName)) {
                      duplicateTypes.add(typeName);
                      build.recoverable(null, () => {
                        build.registerInputObjectType(
                          typeName,
                          {
                            isRelationDisconnectByNodeInputType: true,
                          },
                          () => ({
                            description: build.wrapDescription(
                              `Relationship ${method} by node id input field for ${remoteResource.name} in the ${relationName} relationship`,
                              'type'
                            ),
                            fields: ({fieldWithHooks}) => {
                              const fields =
                                spec.uniqueMode === 'node' && nodeIdFieldName
                                  ? {
                                      [nodeIdFieldName]: fieldWithHooks(
                                        {
                                          fieldName: nodeIdFieldName,
                                        },
                                        {
                                          description: build.wrapDescription(
                                            `The globally unique \`ID\` which will identify a single \`${inflection.tableType(remoteResource.codec)}\` to be ${method}ed.`,
                                            'field'
                                          ),
                                          type: new GraphQLNonNull(GraphQLID),
                                        }
                                      ),
                                    }
                                  : Object.fromEntries(
                                      spec.unique.attributes.map((attr) => {
                                        const fieldName = inflection.attribute({
                                          attributeName: attr,
                                          codec: remoteResource.codec,
                                        });
                                        const attribute =
                                          remoteResource.codec.attributes[attr];
                                        const fieldType =
                                          build.getGraphQLTypeByPgCodec(
                                            attribute.codec,
                                            'input'
                                          );
                                        if (!fieldType) {
                                          throw new Error(
                                            `Could not find field type for ${attr}`
                                          );
                                        }
                                        return [
                                          fieldName,
                                          fieldWithHooks(
                                            {fieldName},
                                            {
                                              description:
                                                attribute.description,
                                              type: new GraphQLNonNull(
                                                fieldType
                                              ),
                                            }
                                          ),
                                        ];
                                      })
                                    );
                              return fields;
                            },
                          }),
                          `Creating relationship ${method} by ${uniqueMode} ${uniqueMode === 'node' ? 'id' : `(${unique.attributes.join(', ')})`}input type for ${relationName} relationship`
                        );
                        resourceRelationInputs.push({
                          fieldName,
                          typeName,
                          relationName,
                          method: 'disconnect',
                          unique,
                          mode: uniqueMode === 'node' ? 'node' : 'keys',
                        });
                      });
                    }
                  }
                }

                build.pgRelationInputsFields[resource.name] = [
                  ...build.pgRelationInputsFields[resource.name],
                  ...resourceRelationInputs,
                ];
              }
            }
          }
          return _;
        },
      },
    },
  };
