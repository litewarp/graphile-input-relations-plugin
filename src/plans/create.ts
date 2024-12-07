import {
  type PgInsertSingleStep,
  type PgUpdateSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';
import {
  type ExecutableStep,
  type InputObjectFieldApplyPlanResolver,
  __InputListStep,
  __InputObjectStep,
} from 'grafast';
import type {PgRelationInputData} from '../interfaces.ts';

export function getRelationCreatePlanResolver<
  TFieldStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>(
  build: GraphileBuild.Build,
  relation: PgRelationInputData
): InputObjectFieldApplyPlanResolver<TFieldStep> {
  const {
    behavior: {pgCodecAttributeMatches},
    inflection,
  } = build;

  const {remoteResource, matchedAttributes} = relation;

  const relFieldNames = (
    build.pgRelationInputsTypes[remoteResource.name] ?? []
  ).map((r) => r.fieldName);

  const isInsertable = (name: string) =>
    pgCodecAttributeMatches([remoteResource.codec, name], 'attribute:insert');

  const prepareAttrs = (
    $object: __InputObjectStep
  ): Record<string, ExecutableStep> => {
    return Object.entries(remoteResource.codec.attributes).reduce(
      (memo, [attributeName, {notNull}]) => {
        const inflectedName = inflection.attribute({
          attributeName,
          codec: remoteResource.codec,
        });
        if (!isInsertable(attributeName)) return memo;

        if (notNull && inflectedName === 'rowId') return memo;
        // WARNING!! We have to eval the argument here
        // and omit the value if it's not present to avoid
        // inserting null values
        if (notNull && !$object.evalHas(inflectedName)) return memo;

        memo[attributeName] = $object.get(inflectedName);
        return memo;
      },
      {} as Record<string, ExecutableStep>
    );
  };

  const resolver: InputObjectFieldApplyPlanResolver<TFieldStep> = (
    $object,
    args,
    _info
  ) => {
    const $rawArgs = args.getRaw();

    if ($rawArgs instanceof __InputObjectStep) {
      // build item
      const $item = pgInsertSingle(remoteResource, prepareAttrs($rawArgs));
      // set foreign keys on parent object
      for (const {local, remote} of matchedAttributes) {
        $object.set(local.name, $item.get(remote.name));
      }
      for (const field of relFieldNames) {
        args.apply($item, [field]);
      }
    } else if ($rawArgs instanceof __InputListStep) {
      // WARNING!! We have to eval the array length here to iterate
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i);

        if (!($rawArg instanceof __InputObjectStep)) {
          console.warn(`Unexpected args type: ${$rawArg.constructor.name}`);
          continue;
        }
        const attrs = prepareAttrs($rawArg);

        for (const {local, remote} of matchedAttributes) {
          attrs[remote.name] = $object.get(local.name);
        }

        const $item = pgInsertSingle(remoteResource, attrs);
        for (const field of relFieldNames) {
          args.apply($item, [i, field]);
        }
      }
    } else {
      console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
    }
  };

  return resolver;
}
