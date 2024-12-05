import {
  type PgInsertSingleStep,
  type PgResourceUnique,
  type PgUpdateSingleStep,
  pgUpdateSingle,
} from 'postgraphile/@dataplan/pg';
import {
  type ExecutableStep,
  type InputObjectFieldApplyPlanResolver,
  __InputListStep,
  __InputObjectStep,
  specFromNodeId,
} from 'postgraphile/grafast';
import type {PgRelationInputData} from '../interfaces.ts';

export function getRelationUpdatePlanResolver<
  TFieldStep extends PgInsertSingleStep | PgUpdateSingleStep =
    | PgInsertSingleStep
    | PgUpdateSingleStep,
>(
  build: GraphileBuild.Build,
  relation: PgRelationInputData,
  mode: 'node' | 'keys',
  _unique: PgResourceUnique
): InputObjectFieldApplyPlanResolver<TFieldStep> {
  const {
    inflection,
    behavior: {pgCodecAttributeMatches},
  } = build;
  const {remoteResource} = relation;

  const primaryUnique = remoteResource.uniques.find((u) => u.isPrimary);

  const prepareAttrs = (
    $object: __InputObjectStep
  ): Record<string, ExecutableStep> => {
    return Object.fromEntries(
      Object.entries(remoteResource.codec.attributes)
        .filter(([name, _]) => {
          const isUpdatable = pgCodecAttributeMatches(
            [remoteResource.codec, name],
            'attribute:update'
          );
          if (!isUpdatable) return false;
          const isPrimaryAttribute = primaryUnique?.attributes.some(
            (a) => a === name
          );
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
            // because of the attribute check on PgUpdateSingleStep
            // and PgUpdateSingleStep
            // if (!$object.evalHas(inflectedName)) {
            //   return false;
            // }
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
  const relFieldNames = (
    build.pgRelationInputsTypes[remoteResource.name] ?? []
  ).map((r) => r.fieldName);

  const resolver: InputObjectFieldApplyPlanResolver<TFieldStep> = (
    _$object,
    args,
    _info
  ) => {
    const $rawArgs = args.getRaw();

    if ($rawArgs instanceof __InputObjectStep) {
      if (mode === 'node') {
        const nodeIdHandler =
          build.getNodeIdHandler &&
          build.getNodeIdHandler(inflection.tableType(remoteResource.codec));
        if (!nodeIdHandler) {
          throw new Error(`No nodeIdHandler found for ${remoteResource.name}`);
        }
        const spec = specFromNodeId(
          nodeIdHandler,
          $rawArgs.get(inflection.nodeIdFieldName())
        ) as Record<string, ExecutableStep>;

        const $patch = $rawArgs.get('patch');
        const $item = pgUpdateSingle(
          remoteResource,
          spec,
          prepareAttrs($patch as __InputObjectStep)
        );

        for (const field of relFieldNames) {
          args.apply($item, ['patch', field]);
        }
      } else {
        // handle keys
      }
    } else if ($rawArgs instanceof __InputListStep) {
      // WARNING!! We have to eval the array length here to iterate
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i) as __InputObjectStep;
        if (mode === 'node') {
          const nodeIdHandler =
            build.getNodeIdHandler &&
            build.getNodeIdHandler(inflection.tableType(remoteResource.codec));
          if (!nodeIdHandler) {
            throw new Error(
              `No nodeIdHandler found for ${remoteResource.name}`
            );
          }
          const spec = specFromNodeId(
            nodeIdHandler,
            $rawArg.get(inflection.nodeIdFieldName())
          ) as Record<string, ExecutableStep>;

          const $patch = $rawArg.get('patch');
          const $item = pgUpdateSingle(
            remoteResource,
            spec,
            prepareAttrs($patch as __InputObjectStep)
          );

          for (const field of relFieldNames) {
            args.apply($item, [i, 'patch', field]);
          }
        } else {
          // handle keys
        }
      }
    }
  };
  return resolver;
}
