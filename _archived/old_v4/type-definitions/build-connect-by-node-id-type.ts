import type {PgNestedMutationRelationship} from '../../../interfaces.ts';

export function buildConnectByNodeIdType(
  rel: PgNestedMutationRelationship,
  build: GraphileBuild.Build
): void {
  const {
    inflection,
    graphql: {GraphQLNonNull, GraphQLID},
  } = build;

  const {
    mutationFields: {connectByNodeId},
    rightTable,
    relationName,
  } = rel;

  if (!connectByNodeId) {
    throw new Error(
      `Could not find connectByNodeId field and type names for relation ${relationName}`
    );
  }

  build.registerInputObjectType(
    connectByNodeId.typeName,
    {
      isNestedMutationConnectByNodeIdType: true,
      isNestedMutationInputType: true,
    },
    () => ({
      description: build.wrapDescription(
        `The globally unique \`ID\` to be used in the connection.`,
        'type'
      ),
      fields: ({fieldWithHooks}) => ({
        [inflection.nodeIdFieldName()]: fieldWithHooks(
          {fieldName: inflection.nodeIdFieldName()},
          () => ({
            description: `The globally unique \`ID\` which identifies a single \`${rightTable.name}\` to be connected.`,
            type: new GraphQLNonNull(GraphQLID),
          })
        ),
      }),
    }),
    `Adding connect by nodeId input type for ${rightTable.name}`
  );
}
