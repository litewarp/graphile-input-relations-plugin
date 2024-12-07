import {
  type PgInsertSingleStep,
  type PgResourceUnique,
  type PgUpdateSingleStep,
  pgUpdateSingle,
} from '@dataplan/pg';
import {
  type InputObjectFieldApplyPlanResolver,
  __InputListStep,
  __InputObjectStep,
  condition,
  constant,
  specFromNodeId,
} from 'grafast';
import type {ExecutableStep} from 'postgraphile/grafast';
import type {PgRelationInputData} from '../interfaces.ts';

export function getRelationDisconnectPlanResolver<
  TFieldStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>(
  build: GraphileBuild.Build,
  relationship: PgRelationInputData,
  mode: 'node' | 'keys',
  unique: PgResourceUnique
): InputObjectFieldApplyPlanResolver<TFieldStep> {
  const {inflection} = build;

  const {remoteResource, matchedAttributes} = relationship;

  const resolver: InputObjectFieldApplyPlanResolver<TFieldStep> = (
    $object,
    args,
    _info
  ) => {
    console.log('in disconnect resolver');
    const $rawArgs = args.getRaw();

    if ($rawArgs instanceof __InputObjectStep) {
      console.log('forward relation');
      // we are in a forward relation
      // foreign key is on the local resource

      let spec: Record<string, ExecutableStep> = {};

      // let's check the relation spec to make sure that the user has properly identified the relation to disconnect
      if (mode === 'node') {
        const handler =
          build.getNodeIdHandler &&
          build.getNodeIdHandler(inflection.tableType(remoteResource.codec));
        if (!handler) {
          throw new Error(`No nodeIdHandler found for ${remoteResource.name}`);
        }
        spec = specFromNodeId(
          handler,
          $rawArgs.get(inflection.nodeIdFieldName())
        ) as Record<string, ExecutableStep>;
      } else if (mode === 'keys') {
        spec = Object.fromEntries(
          unique.attributes.map((attributeName) => [
            attributeName,
            $rawArgs.get(
              inflection.attribute({attributeName, codec: remoteResource.codec})
            ),
          ]) as [string, ExecutableStep][]
        );
      }

      for (const {local, remote} of matchedAttributes) {
        if (condition('===', $object.get(local.name), spec[remote.name])) {
          $object.set(local.name, constant(null));
        }
      }

      args.apply($object);
    } else if ($rawArgs instanceof __InputListStep) {
      // backward relation
      // WARNING!! We have to eval the array length here to iterate
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i);

        if (!($rawArg instanceof __InputObjectStep)) {
          console.warn(`Unexpected args type: ${$rawArg.constructor.name}`);
          continue;
        }

        let spec: Record<string, ExecutableStep> = {};
        // let's check the relation spec to make sure that the user has properly identified the relation to disconnect
        if (mode === 'node') {
          const handler =
            build.getNodeIdHandler &&
            build.getNodeIdHandler(inflection.tableType(remoteResource.codec));
          if (!handler) {
            throw new Error(
              `No nodeIdHandler found for ${remoteResource.name}`
            );
          }
          spec = specFromNodeId(
            handler,
            $rawArg.get(inflection.nodeIdFieldName())
          ) as Record<string, ExecutableStep>;
        } else if (mode === 'keys') {
          spec = Object.fromEntries(
            unique.attributes.map((attributeName) => [
              attributeName,
              $rawArg.get(
                inflection.attribute({
                  attributeName,
                  codec: remoteResource.codec,
                })
              ),
            ]) as [string, ExecutableStep][]
          );
        }

        const $item = pgUpdateSingle(remoteResource, spec);
        for (const {local, remote} of matchedAttributes) {
          if (
            condition('===', $object.get(local.name), $item.get(remote.name))
          ) {
            $item.set(remote.name, constant(null));
          }
        }

        // apply the argument down the line
        args.apply($item, [i]);
      }
    } else console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
    return;
  };

  return resolver;
}
