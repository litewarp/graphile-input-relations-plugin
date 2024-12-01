import {
  type PgInsertSingleStep,
  type PgUpdateSingleStep,
  pgUpdateSingle,
} from '@dataplan/pg';
import {
  type InputObjectFieldApplyPlanResolver,
  __InputListStep,
  __InputObjectStep,
  specFromNodeId,
} from 'postgraphile/grafast';
import type {PgRelationInputData} from '../relationships.ts';

export function getNestedConnectByIdPlanResolver<
  TFieldStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>(
  build: GraphileBuild.Build,
  relationship: PgRelationInputData
): InputObjectFieldApplyPlanResolver<TFieldStep> {
  const {inflection} = build;

  const {remoteResource, localAttributes, remoteAttributes} = relationship;

  const resolver: InputObjectFieldApplyPlanResolver<TFieldStep> = (
    $object,
    args,
    _info
  ) => {
    const $rawArgs = args.getRaw();
    const nodeIdHandler =
      build.getNodeIdHandler &&
      build.getNodeIdHandler(inflection.tableType(remoteResource.codec));
    if (!nodeIdHandler) {
      throw new Error(`No nodeIdHandler found for ${remoteResource.name}`);
    }
    if ($rawArgs instanceof __InputObjectStep) {
      // key to add is on the parent
      // set it and return
      const spec = specFromNodeId(
        nodeIdHandler,
        $rawArgs.get(inflection.nodeIdFieldName())
      );

      Object.keys(spec).forEach((key) => {
        const remoteAttrIdx = remoteAttributes.map((a) => a.name).indexOf(key);

        const local = localAttributes[remoteAttrIdx];
        if (local) {
          $object.set(local.name, spec[key]);
        }
      });

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
        const attrs = remoteAttributes.reduce((memo, remote, idx) => {
          const local = localAttributes[idx];
          if (!local || !remote) return memo;
          return {
            ...memo,
            [remote.name]: $object.get(local.name),
          };
        }, {});

        const spec = specFromNodeId(
          nodeIdHandler,
          $rawArg.get(inflection.nodeIdFieldName())
        );
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
