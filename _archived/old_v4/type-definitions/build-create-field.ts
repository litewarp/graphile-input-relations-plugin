import type {GraphileBuild} from 'graphile-build';
import type {__InputListStep, __InputObjectStep} from 'postgraphile/grafast';
import {isInsertOrUpdate} from '../helpers.ts';
import type {PgNestedMutationRelationship} from '../../../interfaces.ts';
import {nestedCreateStep} from '../../v4_to_v5/steps/nested-create-step.ts';

export function buildCreateField(
  relationship: PgNestedMutationRelationship,
  build: GraphileBuild.Build
): Parameters<GraphileBuild.InputFieldWithHooksFunction> {
  const {
    EXPORTABLE,
    graphql: {GraphQLList, GraphQLNonNull},
  } = build;

  const {
    mutationFields: {create},
    rightTable,
    isReverse,
    isUnique,
    relationName,
  } = relationship;

  if (!create) {
    throw new Error(
      `Could not find create field and type names for relation ${relationName}`
    );
  }

  const inputType = build.getInputTypeByName(create.typeName);

  return [
    {
      fieldName: create.fieldName,
      isNestedMutationInputType: true,
      isNestedMutationCreateInputType: true,
    },
    {
      description: build.wrapDescription(
        `A \`${build.getGraphQLTypeNameByPgCodec(
          rightTable.codec,
          'input'
        )}\` object that will be created and connected to this object.`,
        'field'
      ),
      type:
        !isReverse || isUnique
          ? inputType
          : new GraphQLList(new GraphQLNonNull(inputType)),
      applyPlan: EXPORTABLE(
        (isInsertOrUpdate, nestedCreateStep, relationship) =>
          function plan($parent, args, _info) {
            const {
              isReverse,
              isUnique,
              rightTable,
              localAttributes,
              remoteAttributes,
            } = relationship;

            if (isInsertOrUpdate($parent)) {
              if (!isReverse || isUnique) {
                // if the left table contains the foreign keys
                // the relation is unique so you can only input one
                // create the new right table object and then update the left table

                const $nestedObj = nestedCreateStep(rightTable, args.get());

                for (let i = 0; i < localAttributes.length; i++) {
                  const field = localAttributes[i];
                  const remote = remoteAttributes[i];
                  if (field && remote) {
                    $parent.set(field, $nestedObj.get(remote));
                  }
                }
              } else {
                // if the relation table contains the foreign keys
                // i.e., isReverse = true
                // get the referenced key on the root table
                // add it to the payload for the nested create

                const $list = args.getRaw() as __InputListStep;

                const listLength = $list.evalLength() ?? 0;

                for (let j = 0; j < listLength; j++) {
                  const $item = $list.getDep(j) as __InputObjectStep;

                  const $nestedObj = nestedCreateStep(rightTable, $item);

                  for (let i = 0; i < localAttributes.length; i++) {
                    const field = localAttributes[i];
                    const remote = remoteAttributes[i];
                    if (field && remote) {
                      $nestedObj.set(remote, $parent.get(field));
                    }
                  }
                }
              }
            }
          },

        [isInsertOrUpdate, nestedCreateStep, relationship]
      ),
    },
  ];
}
