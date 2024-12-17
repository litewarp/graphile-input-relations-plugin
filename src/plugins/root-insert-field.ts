import {
  type ExecutableStep,
  type FieldArgs,
  type ObjectStep,
  type __TrackedValueStep,
  object,
} from 'grafast';
import {GraphQLNonNull} from 'graphql';
import {EXPORTABLE} from 'postgraphile/utils';
import {
  type PgInsertSingleWithRelationInputsStep,
  pgInsertSingleWithRelationInputsStep,
} from '../steps/the-step.ts';
import {} from '../utils/resource.ts';

export const PgRelationInputsFieldsPlugin: GraphileConfig.Plugin = {
  name: 'PgRelationInputsFieldsPlugin',
  description: 'Adds input types for relationships on pg table resource fields',
  version: '0.0.1',
  after: [
    'PgRelationInputsResourceFieldsPlugin',
    'PgRelationInputsTypesPlugin',
  ],
  experimental: true,

  schema: {
    hooks: {
      GraphQLObjectType(type, _build, context) {
        const {
          scope: {isPgClassType, pgCodec},
        } = context;
        if (!isPgClassType || !pgCodec) return type;
        // HACK!! We remove the pgClassSingle Assert Step for Now
        return {
          ...type,
          assertStep: undefined,
        };
      },
      GraphQLObjectType_fields_field(field, build, context) {
        const {inflection} = build;
        const {
          scope: {isRootMutation, fieldName},
        } = context;
        if (isRootMutation) {
          const resource = build.pgRootFieldNamesToCodec.get(fieldName);
          if (!resource) return field;

          const inputType = build.getInputTypeByName(
            inflection.createInputType(resource)
          );
          if (!inputType) return field;

          return {
            ...field,
            args: {
              input: {
                type: new GraphQLNonNull(inputType),
                autoApplyAfterParentPlan: true,
                applyPlan: EXPORTABLE(
                  () =>
                    function plan(
                      _: __TrackedValueStep,
                      $object: ObjectStep<{
                        result: PgInsertSingleWithRelationInputsStep;
                      }>
                    ) {
                      return $object;
                    },
                  []
                ),
              },
            },
            plan: EXPORTABLE(
              (object, pgInsertSingleWithRelationInputsStep, resource) =>
                function plan(_: ExecutableStep, args: FieldArgs) {
                  const $insert = object({
                    result: pgInsertSingleWithRelationInputsStep(resource),
                  });
                  args.apply($insert);
                  return $insert;
                },
              [object, pgInsertSingleWithRelationInputsStep, resource]
            ),
          };
        }
        return field;
      },
    },
  },
};
