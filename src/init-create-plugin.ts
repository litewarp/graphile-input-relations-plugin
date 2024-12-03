import type {} from '@dataplan/pg';
import {ObjectStep} from 'grafast';
import type {GraphQLInputObjectType} from 'graphql';
import type {
  PgRelationInputData,
  PgTableResource,
  RelationInputTypeInfo,
} from './interfaces.ts';
import {getRelationships} from './relationships.ts';
import {isInsertable, isPgTableResource, isUpdatable} from './utils/resource.ts';

declare global {
  namespace GraphileBuild {
    interface Build {
      pgRelationshipMutationRootFields: Map<string, string[][]>;
      pgRootFieldNamesToCodec: Map<string, PgTableResource>;
      pgRelationInputsFields: Record<string, RelationInputTypeInfo[]>;
      pgRelationInputsTypes: Record<string, PgRelationInputData[]>;
    }
    interface Inflection {
      relationCreateField(this: Inflection, relationship: PgRelationInputData): string;
      relationCreateInputType(
        this: Inflection,
        relationship: PgRelationInputData
      ): string;
    }
    interface ScopeInputObject {
      isRelationCreateInputType?: boolean;
    }
  }
}

export const PgRelationInputsInitCreatePlugin: GraphileConfig.Plugin = {
  name: 'PgRelationInputsInitCreatePlugin',
  description:
    'Gathers the context data for the nested mutations plugin and adds a create field if needed',
  version: '0.0.1',
  after: ['smart-tags', 'PgFakeConstraintsPlugin', 'PgTablesPlugin', 'PgRelationsPlugin'],
  experimental: true,

  inflection: {
    add: {
      relationCreateField(_options, _relationship) {
        return this.camelCase('create');
      },
      relationCreateInputType(_options, {relationName}) {
        return this.upperCamelCase(`${relationName}-create-input`);
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        build.pgRelationshipMutationRootFields = new Map();
        build.pgRootFieldNamesToCodec = new Map();
        build.pgRelationInputsFields = {};
        build.pgRelationInputsTypes = {};

        return build;
      },

      init(_, build) {
        const {inflection} = build;

        const duplicateTypes = new Set<string>();

        const tableResources = Object.values(build.input.pgRegistry.pgResources).filter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          (resource) => isPgTableResource(resource)
        );

        for (const resource of tableResources) {
          const relationships = getRelationships(build, resource);

          build.pgRelationInputsFields[resource.name] = [];
          build.pgRelationInputsTypes[resource.name] = relationships;

          for (const relation of relationships) {
            const {isReferencee, remoteResource, relationName} = relation;

            const insertable = isInsertable(build, remoteResource);

            // check to see if the foreign key is on the local resource
            // if so, we need to make sure that the local resource is updatable
            if (!isReferencee && !isUpdatable(build, resource)) {
              throw new Error(
                `Can't add create field for ${relationName} relation because ${resource.name} is not updatable`
              );
            }

            if (insertable) {
              const fieldName = inflection.relationCreateField(relation);
              const typeName = inflection.relationCreateInputType(relation);

              if (!duplicateTypes.has(typeName)) {
                duplicateTypes.add(typeName);

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
                          remoteResource.codec
                        )} to be created by this mutation.`,
                        'type'
                      ),
                      fields: ({fieldWithHooks}) => {
                        const TableType = build.getGraphQLTypeByPgCodec(
                          remoteResource.codec,
                          'input'
                        );
                        const primaryKeyAttrs = remoteResource.uniques
                          .find((u) => u.isPrimary)
                          ?.attributes.map((a) =>
                            inflection.attribute({
                              attributeName: a,
                              codec: remoteResource.codec,
                            })
                          );
                        return Object.fromEntries(
                          Object.entries(
                            (TableType as GraphQLInputObjectType).getFields()
                          ).map(([name, field]) => {
                            let type = field.type;
                            if (
                              isReferencee &&
                              primaryKeyAttrs?.includes(name.toString()) &&
                              build.graphql.isNonNullType(type)
                            ) {
                              type = type.ofType;
                            }
                            return [
                              name,
                              fieldWithHooks({fieldName: name}, {...field, type}),
                            ];
                          })
                        );
                      },
                    }),
                    `Add a relationship create input type for ${remoteResource.name} on ${relationName}`
                  );
                  build.pgRelationInputsFields[resource.name].push({
                    fieldName,
                    typeName,
                    relationName,
                    method: 'create',
                    mode: undefined,
                  });
                });
              }
            }
          }
        }
        return _;
      },
    },
  },
};
