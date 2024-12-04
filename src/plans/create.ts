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

  const {remoteResource, localAttributes, remoteAttributes} = relation;

  const primaryUnique = remoteResource.uniques.find((u) => u.isPrimary);

  const relFieldNames = (build.pgRelationInputsTypes[remoteResource.name] ?? []).map(
    (r) => r.fieldName
  );

  const prepareAttrs = ($object: __InputObjectStep): Record<string, ExecutableStep> => {
    return Object.fromEntries(
      Object.entries(remoteResource.codec.attributes)
        .filter(([name, _]) => {
          const isInsertable = pgCodecAttributeMatches(
            [remoteResource.codec, name],
            'attribute:insert'
          );

          if (!isInsertable) return false;

          const isPrimaryAttribute = primaryUnique?.attributes.some((a) => a === name);
          const inflectedName = inflection.attribute({
            attributeName: name,
            codec: remoteResource.codec,
          });

          if (isPrimaryAttribute) {
            if (inflectedName === 'rowId') {
              return false;
            }
            // WARNING!! We have to eval the argument here
            // and omit the value if it's not present
            // otherwise, we won't be able to set it down the line
            // because of the attribute check on PgInsertSingleStep
            // and PgUpdateSingleStep
            if (!$object.evalHas(inflectedName)) {
              return false;
            }
          }
          return true;
        })
        .map(([name, _]) => [
          name,
          $object.get(
            inflection.attribute({
              attributeName: name,
              codec: remoteResource.codec,
            })
          ),
        ])
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
      localAttributes.forEach((local, i) => {
        const remote = remoteAttributes[i];
        if (remote) {
          $object.set(local.name, $item.get(remote.name));
        }
      });
      for (const field of relFieldNames) {
        args.apply($item, [field]);
      }
    } else if ($rawArgs instanceof __InputListStep) {
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i);

        if (!($rawArg instanceof __InputObjectStep)) {
          console.warn(`Unexpected args type: ${$rawArg.constructor.name}`);
          continue;
        }
        const attrs = prepareAttrs($rawArg);

        for (const [idx, remote] of remoteAttributes.entries()) {
          const local = localAttributes[idx];
          if (!remote || !local) continue;

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
