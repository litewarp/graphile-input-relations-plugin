import type {PgInsertSingleStep, PgUpdateSingleStep} from '@dataplan/pg';
import {
  type ExecutableStep,
  type ObjectStep,
  isObjectLikeStep,
} from 'postgraphile/grafast';
import type {PgCodecRelationWithName} from '../helpers.ts';

export function pgRelationshipForwardConnectByKeysStep<
  TRelationship extends PgCodecRelationWithName,
>(
  _build: GraphileBuild.Build,
  $item: ObjectStep,
  $parent: PgInsertSingleStep | PgUpdateSingleStep,
  relationship: TRelationship
  // selections: [] = []
): ExecutableStep {
  const {localAttributes, remoteAttributes} = relationship;

  if (!isObjectLikeStep($item)) {
    throw new Error(`Expected input to be an object, but got ${typeof $item}`);
  }

  localAttributes.forEach((local, index) => {
    const remote = remoteAttributes[index];
    if (local && remote) {
      $parent.set(local, $item.get(remote));
    }
  });
  return $parent;
}
