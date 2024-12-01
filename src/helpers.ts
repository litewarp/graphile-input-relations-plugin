import type {
  PgCodecRelation,
  PgCodecWithAttributes,
  PgRegistry,
  PgResource,
  PgResourceUnique,
} from '@dataplan/pg';
import type {} from '@dataplan/pg';
import type {} from 'graphile-build-pg';

export function isPgTableResource(r: PgResource): r is PgTableResource {
  return Boolean(r.codec.attributes) && !r.parameters;
}

export interface PgCodecRelationWithName
  extends PgCodecRelation<PgCodecWithAttributes, PgTableResource> {
  name: string;
  resource: string;
}
export type PgTableResource = PgResource<
  string,
  PgCodecWithAttributes,
  PgResourceUnique[],
  undefined,
  PgRegistry
>;

export const getUniqueMode = (
  build: GraphileBuild.Build,
  resource: PgTableResource,
  mode: 'insert' | 'update' | 'delete'
): 'node' | 'keys' => {
  if (
    build.getNodeIdCodec !== undefined &&
    build.behavior.pgCodecMatches(
      resource.codec,
      `nodeId:${mode}` as keyof GraphileBuild.BehaviorStrings
    )
  ) {
    return 'node';
  }
  return 'keys';
};

export const isNestedMutableResource = (
  build: GraphileBuild.Build,
  resource: PgResource
): resource is PgTableResource => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  const behaviors = ['resource:insert', 'resource:update', 'resource:delete'] as const;
  return behaviors.some((behavior) =>
    build.behavior.pgResourceMatches(resource, behavior)
  );
};

export const isInsertable = (build: GraphileBuild.Build, resource: PgTableResource) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  return build.behavior.pgResourceMatches(resource, 'resource:insert') === true;
};

export const isUpdatable = (build: GraphileBuild.Build, resource: PgTableResource) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  if (!resource.uniques || resource.uniques.length < 1) return false;
  return Boolean(build.behavior.pgResourceMatches(resource, 'resource:update'));
};

export const isDeletable = (build: GraphileBuild.Build, resource: PgTableResource) => {
  if (resource.parameters) return false;
  if (!resource.codec.attributes) return false;
  if (resource.codec.polymorphism) return false;
  if (resource.codec.isAnonymous) return false;
  if (!resource.uniques || resource.uniques.length < 1) return false;
  return Boolean(build.behavior.pgResourceMatches(resource, 'resource:delete'));
};
