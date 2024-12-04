import type {
  PgInsertSingleStep,
  PgResourceUnique,
  PgUpdateSingleStep,
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

  const {remoteResource, matchedAttributes} = relationship;

  const resolver: InputObjectFieldApplyPlanResolver<TFieldStep> = (
    $object,
    args,
    _info
  ) => {
    const $rawArgs = args.getRaw();

    if ($rawArgs instanceof __InputObjectStep) {
      // key to add is on the parent
      // set it and return

      const spec = Object.fromEntries(
        unique.attributes.map((attr) => {
          return [
            attr,
            $rawArgs.get(
              inflection.attribute({
                attributeName: attr,
                codec: remoteResource.codec,
              })
            ),
          ];
        })
      );

      const $item = remoteResource.get(spec);

      for (const {local, remote} of matchedAttributes) {
        $object.set(local.name, $item.get(remote.name));
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
        // const spec: Record<string, ExecutableStep> = {};
        const attrs: Record<string, ExecutableStep> = {};
        for (const {local, remote} of matchedAttributes) {
          attrs[remote.name] = $object.get(local.name);
        }
        // const $item = pgUpdateSingle(remoteResource, spec, attrs);

        // args.apply($item, [i]);
      }
    } else {
      console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
      return;
    }
  };

  return resolver;
}
