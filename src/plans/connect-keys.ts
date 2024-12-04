import {
  type PgInsertSingleStep,
  type PgResourceUnique,
  type PgUpdateSingleStep,
  pgUpdateSingle,
} from '@dataplan/pg';
import {
  type ExecutableStep,
  type InputObjectFieldApplyPlanResolver,
  __InputListStep,
  __InputObjectStep,
} from 'grafast';
import type {PgRelationInputData} from '../interfaces.ts';

export function getRelationConnectByKeysPlanResolver<
  TFieldStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>(
  build: GraphileBuild.Build,
  relationship: PgRelationInputData,
  unique: PgResourceUnique
): InputObjectFieldApplyPlanResolver<TFieldStep> {
  const {inflection} = build;

  const {remoteResource, localAttributes, remoteAttributes} = relationship;

  const resolver: InputObjectFieldApplyPlanResolver<TFieldStep> = (
    $object,
    args,
    _info
  ) => {
    const $rawArgs = args.getRaw();
    if ($rawArgs instanceof __InputObjectStep) {
      // key to add is on the parent
      // set it and return

      for (const attr of unique.attributes) {
        $object.set(
          attr,
          $rawArgs.get(
            inflection.attribute({
              attributeName: attr,
              codec: remoteResource.codec,
            })
          )
        );
      }
      args.apply($object);
      // Since we're setting fields on the parent object
      // we can just return
    } else if ($rawArgs instanceof __InputListStep) {
      // keys are on the children
      // create an update object for pgUpdateSingle
      // and apply it down the line to other connector fields
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i);
        if (!($rawArg instanceof __InputObjectStep)) {
          console.warn(`Unexpected args type: ${$rawArg.constructor.name}`);
          continue;
        }
        const spec: Record<string, ExecutableStep> = {};
        const attrs: Record<string, ExecutableStep> = {};
        remoteAttributes.forEach((remote, idx) => {
          const local = localAttributes[idx];
          if (local && remote) {
            attrs[remote.name] = $object.get(local.name);
            spec[remote.name] = $rawArg.get(
              inflection.attribute({
                attributeName: remote.name,
                codec: remoteResource.codec,
              })
            );
          }
        });
        const $item = pgUpdateSingle(remoteResource, spec, attrs);

        args.apply($item, [i]);
      }
    } else {
      console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
      return;
    }
  };

  return resolver;
}
