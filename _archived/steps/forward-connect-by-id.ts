import type {PgInsertSingleStep, PgUpdateSingleStep} from '@dataplan/pg';
import {
  type ExecutableStep,
  type NodeIdHandler,
  type ObjectStep,
  isObjectLikeStep,
  specFromNodeId,
} from 'postgraphile/grafast';
import type {PgCodecRelationWithName} from '../helpers.ts';

export function pgRelationshipForwardConnectByNodeIdStep<
  TRelationship extends PgCodecRelationWithName,
>(
  build: GraphileBuild.Build,
  remoteHandler: NodeIdHandler,
  $item: ObjectStep,
  $parent: PgInsertSingleStep | PgUpdateSingleStep,
  relationship: TRelationship
  // selections: [] = []
): ExecutableStep {
  const {localAttributes, remoteAttributes} = relationship;

  if (!isObjectLikeStep($item)) {
    throw new Error(`Expected input to be an object, but got ${typeof $item}`);
  }
  const $id = $item.get(build.inflection.nodeIdFieldName());

  const spec = specFromNodeId(remoteHandler, $id);

  Object.keys(spec).forEach((key) => {
    const remoteAttrIndex = remoteAttributes.indexOf(key);
    const local = localAttributes[remoteAttrIndex];
    if (!local) {
      throw new Error(`Could not find ${key} in local or remote attributes`);
    }
    $parent.set(local, spec[key]);
  });

  return $parent;
}
