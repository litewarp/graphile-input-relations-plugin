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
  specFromNodeId,
} from 'grafast';
import type {PgRelationInputData} from '../interfaces.ts';

export function getRelationUpdatePlanResolver<
  TFieldStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>(
  build: GraphileBuild.Build,
  relation: PgRelationInputData,
  mode: 'node' | 'keys',
  unique: PgResourceUnique
): InputObjectFieldApplyPlanResolver<TFieldStep> {
  const {
    inflection,
    behavior: {pgCodecAttributeMatches},
  } = build;
  const {remoteResource} = relation;

  const isUpdatable = (name: string) =>
    pgCodecAttributeMatches([remoteResource.codec, name], 'attribute:update');

  const prepareAttrs = (
    $object: __InputObjectStep
  ): Record<string, ExecutableStep> => {
    return Object.entries(remoteResource.codec.attributes).reduce(
      (memo, [attributeName, {notNull}]) => {
        const inflectedName = inflection.attribute({
          attributeName,
          codec: remoteResource.codec,
        });
        if (!isUpdatable(attributeName)) return memo;

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
    _$object,
    args,
    _info
  ) => {
    const $rawArgs = args.getRaw();

    if ($rawArgs instanceof __InputObjectStep) {
      // We are in a forward relation
      let spec: Record<string, ExecutableStep> = {};

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
          (unique.attributes as string[]).map((attributeName) => [
            attributeName,
            $rawArgs.get(
              inflection.attribute({
                attributeName,
                codec: remoteResource.codec,
              })
            ),
          ])
        ) as Record<string, ExecutableStep>;
      }

      const $patch = $rawArgs.get('patch');
      const $item = pgUpdateSingle(
        remoteResource,
        spec,
        prepareAttrs($patch as __InputObjectStep)
      );

      args.apply($item);
    } else if ($rawArgs instanceof __InputListStep) {
      // We are in a backward relation
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
          const nodeIdHandler =
            build.getNodeIdHandler &&
            build.getNodeIdHandler(inflection.tableType(remoteResource.codec));
          if (!nodeIdHandler) {
            throw new Error(
              `No nodeIdHandler found for ${remoteResource.name}`
            );
          }
          spec = specFromNodeId(
            nodeIdHandler,
            $rawArg.get(inflection.nodeIdFieldName())
          ) as Record<string, ExecutableStep>;
        } else {
          spec = Object.fromEntries(
            (unique.attributes as string[]).map((attributeName) => [
              attributeName,
              $rawArg.get(
                inflection.attribute({
                  attributeName,
                  codec: remoteResource.codec,
                })
              ),
            ])
          ) as Record<string, ExecutableStep>;
          // handle keys
        }
        const $patch = $rawArg.get('patch');
        const $item = pgUpdateSingle(
          remoteResource,
          spec,
          prepareAttrs($patch as __InputObjectStep)
        );

        args.apply($item, [i]);
      }
    }
  };
  return resolver;
}
