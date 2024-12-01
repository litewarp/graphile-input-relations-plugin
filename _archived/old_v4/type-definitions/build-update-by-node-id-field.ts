import {} from '@dataplan/pg';
import {
  type ExecutableStep,
  type __InputListStep,
  type __InputObjectStep,
  specFromNodeId,
} from 'postgraphile/grafast';
import type {PgNestedMutationRelationship} from '../../../interfaces.ts';
import {nestedUpdateById} from '../steps/nested-update-by-id-step.ts';

export function buildUpdateByNodeIdField(
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
    rightTable,
    relationName,
    mutationFields: {updateByNodeId},
  } = relationship;

  if (!updateByNodeId) {
    throw new Error(
      `Could not find updateByNodeId field for relation ${relationName}`
    );
  }

  const inputType = build.getInputTypeByName(updateByNodeId.typeName);

  if (!build.getNodeIdHandler) {
    throw new Error(`No build.getNodeIdHandler function found`);
  }

  const rightTableType = inflection.tableType(rightTable.codec);

  const rightHandler = build.getNodeIdHandler(rightTableType);

  if (!rightHandler) {
    throw new Error(`No node id handler found for ${rightTable.name}`);
  }

  const idField = inflection.nodeIdFieldName();

  const getSpec = ($step: ExecutableStep) =>
    specFromNodeId(rightHandler, $step);

  return [
    {fieldName: updateByNodeId.fieldName},
    {
      description: build.wrapDescription(
        `The primary keys and patch data for ${rightTable.name} for the far side of the relationship`,
        'field'
      ),
      type:
        !isReverse || isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      autoApplyAfterParentApplyPlan: true,
      applyPlan: EXPORTABLE(
        (getSpec, idField, nestedUpdateById, relationship) =>
          function plan(_$parent, args) {
            const {isReverse, isUnique} = relationship;

            if (!isReverse || isUnique) {
              nestedUpdateById(relationship, {
                ...getSpec(args.get(idField)),
                patch: args.get('patch'),
              });
            } else {
              const $inputObj = args.getRaw() as __InputListStep;

              const length = $inputObj.evalLength() ?? 0;

              for (let i = 0; i < length; i++) {
                const dep = $inputObj.getDep(i) as __InputObjectStep;

                nestedUpdateById(relationship, {
                  ...getSpec(dep.get(idField)),
                  patch: dep.get('patch'),
                });
              }
            }
          },
        [getSpec, idField, nestedUpdateById, relationship]
      ),
    },
  ];
}
