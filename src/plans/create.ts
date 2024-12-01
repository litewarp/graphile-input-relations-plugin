import {
  type PgInsertSingleStep,
  type PgUpdateSingleStep,
  pgInsertSingle,
} from '@dataplan/pg';
import {
  type InputObjectFieldApplyPlanResolver,
  __InputListStep,
  __InputObjectStep,
} from 'postgraphile/grafast';
import type {PgRelationInputData} from '../relationships.ts';

export function getNestedCreatePlanResolver<
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

  const relFieldNames = (build.pgRelationshipInputTypes[remoteResource.name] ?? []).map(
    (r) => r.fieldName
  );

  const prepareAttrs = ($object: __InputObjectStep) => {
    return Object.keys(remoteResource.codec.attributes).reduce((memo, name) => {
      const isInsertable = pgCodecAttributeMatches(
        [remoteResource.codec, name],
        'attribute:insert'
      );

      if (!isInsertable) return memo;

      const isPrimaryAttribute = primaryUnique?.attributes.some((a) => a === name);
      const inflectedName = inflection.attribute({
        attributeName: name,
        codec: remoteResource.codec,
      });

      if (isPrimaryAttribute) {
        if (inflectedName === 'rowId') {
          return memo;
        }
        // WARNING!! We have to eval the argument here
        // and omit the value if it's not present
        // otherwise, we won't be able to set it down the line
        // because of the attribute check on PgInsertSingleStep
        // and PgUpdateSingleStep
        if (!$object.evalHas(inflectedName)) {
          return memo;
        }
      }
      return {
        ...memo,
        [name]: $object.get(inflectedName),
      };
    }, Object.create(null));
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
      relFieldNames.forEach((field) => args.apply($item, [field]));
    } else if ($rawArgs instanceof __InputListStep) {
      const length = $rawArgs.evalLength() ?? 0;
      for (let i = 0; i < length; i++) {
        const $rawArg = $rawArgs.at(i);

        if (!($rawArg instanceof __InputObjectStep)) {
          console.warn(`Unexpected args type: ${$rawArg.constructor.name}`);
          continue;
        }
        const attrs = remoteAttributes.reduce((memo, remote, idx) => {
          const local = localAttributes[idx];
          if (remote && local) {
            return {...memo, [remote.name]: $object.get(local.name)};
          }
          return memo;
        }, prepareAttrs($rawArg));

        const $item = pgInsertSingle(remoteResource, attrs);
        relFieldNames.forEach((field) => args.apply($item, [i, field]));
      }
    } else {
      console.warn(`Unexpected args type: ${$rawArgs.constructor.name}`);
    }
  };

  return resolver;
}
