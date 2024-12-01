import {pgUpdateSingle} from '@dataplan/pg';
import type {__InputObjectStep} from 'postgraphile/grafast';
import {__InputListStep, specFromNodeId} from 'postgraphile/grafast';
import {isInsertOrUpdate} from '../helpers.ts';
import type {PgNestedMutationRelationship} from '../../../interfaces.ts';

export function buildConnectByNodeIdField(
  relationship: PgNestedMutationRelationship,
  build: GraphileBuild.Build
): Parameters<GraphileBuild.InputFieldWithHooksFunction> {
  const {
    inflection,
    EXPORTABLE,
    graphql: {GraphQLList, GraphQLNonNull},
  } = build;

  const {
    isReverse,
    isUnique,
    mutationFields: {connectByNodeId},
    rightTable,
    relationName,
    localAttributes,
    remoteAttributes,
  } = relationship;

  if (!connectByNodeId) {
    throw new Error(
      `Could not find connectByNodeId field for relation ${relationName}`
    );
  }

  const inputType = build.getInputTypeByName(connectByNodeId.typeName);

  if (!build.getNodeIdHandler) {
    throw new Error(`No build.getNodeIdHandler function found`);
  }

  const rightTableType = inflection.tableType(rightTable.codec);

  const rightHandler = build.getNodeIdHandler(rightTableType);

  if (!rightHandler) {
    throw new Error(`No node id handler found for ${rightTable.name}`);
  }

  const nodeIdFieldName = inflection.nodeIdFieldName();

  return [
    {
      fieldName: connectByNodeId.fieldName,
      isNestedMutationConnectByNodeIdType: true,
      isNestedMutationInputType: true,
    },
    {
      description: build.wrapDescription(
        `A \`${rightTable.name}\` object that will be connected by its ID.`,
        'field'
      ),
      type:
        !isReverse || isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      applyPlan: EXPORTABLE(
        (
          __InputListStep,
          isInsertOrUpdate,
          isReverse,
          localAttributes,
          nodeIdFieldName,
          pgUpdateSingle,
          remoteAttributes,
          rightHandler,
          rightTable,
          specFromNodeId
        ) =>
          function plan($parent, args, _info) {
            if (isInsertOrUpdate($parent)) {
              if (isReverse) {
                const $inputObj = args.getRaw() as
                  | __InputObjectStep
                  | __InputListStep;

                if ($inputObj instanceof __InputListStep) {
                  // extract the ids to connect by from the input object
                  // can't use args.get('id') because it's an array
                  const length = $inputObj.evalLength() ?? 0;

                  for (let i = 0; i < length; i++) {
                    const $obj = $inputObj.at(i);
                    const $id = ($obj as __InputObjectStep).get(
                      nodeIdFieldName
                    );
                    const spec = specFromNodeId(rightHandler, $id);
                    pgUpdateSingle(rightTable, spec, {
                      ...localAttributes.reduce((m, local, i) => {
                        const remote = remoteAttributes[i];
                        if (local && remote) {
                          return {
                            ...m,
                            [remote]: $parent.get(local),
                          };
                        }
                        return m;
                      }, {}),
                    });
                  }
                } else {
                  const $id = $inputObj.get(nodeIdFieldName);
                  const spec = specFromNodeId(rightHandler, $id);
                  pgUpdateSingle(rightTable, spec, {
                    ...localAttributes.reduce((m, local, i) => {
                      const remote = remoteAttributes[i];
                      if (local && remote) {
                        return {
                          ...m,
                          [remote]: $parent.get(local),
                        };
                      }
                      return m;
                    }, {}),
                  });
                }
              } else {
                // key is on the object being updated or created
                // find the node_id and update the foreign key column
                const $nodeId = args.get('id');
                const spec = specFromNodeId(rightHandler, $nodeId);

                for (let i = 0; i < remoteAttributes.length; i++) {
                  const local = localAttributes[i];
                  const remote = remoteAttributes[i];
                  const remoteStep = remote ? spec[remote] : null;
                  if (local && remoteStep) {
                    $parent.set(local, remoteStep);
                  }
                }
              }
            }
          },
        [
          __InputListStep,
          isInsertOrUpdate,
          isReverse,
          localAttributes,
          nodeIdFieldName,
          pgUpdateSingle,
          remoteAttributes,
          rightHandler,
          rightTable,
          specFromNodeId,
        ]
      ),
    },
  ];
}
