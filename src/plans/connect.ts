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
  specFromNodeId,
} from 'grafast';
import type {ExecutableStep} from 'postgraphile/grafast';
import type {PgRelationInputData} from '../interfaces.ts';

export function getRelationConnectPlanResolver<
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
    const $rawArgs = args.getRaw();
    let spec: Record<string, ExecutableStep> = {};

    if ($rawArgs instanceof __InputObjectStep) {
      // we are in a forward relation
      // foreign key is on the local resource

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

      const $item = remoteResource.get(spec);

      for (const {local, remote} of matchedAttributes) {
        $object.set(local.name, $item.get(remote.name));
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
            unique.attributes.map((attr) => [
              attr,
              $rawArg.get(
                inflection.attribute({
                  attributeName: attr,
                  codec: remoteResource.codec,
                })
              ),
            ])
          );
        }

        const attrs = Object.fromEntries(
          matchedAttributes.map(({local, remote}) => [
            remote.name,
            $object.get(local.name),
          ])
        );

        const $item = pgUpdateSingle(remoteResource, spec, attrs);

        // apply the argument down the line
        args.apply($item, [i]);
      }
    } else console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
    return;
  };

  return resolver;
}
