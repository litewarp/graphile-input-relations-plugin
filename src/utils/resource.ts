import type {PgResource, PgResourceUnique} from '@dataplan/pg';
import type {} from 'graphile-build-pg';
import type {PgTableResource} from '../interfaces.ts';

export function isPgTableResource(r: PgResource): r is PgTableResource {
  return Boolean(r.codec.attributes) && !r.parameters;
}

export const isNestedMutableResource = (
  build: GraphileBuild.Build,
  resource: PgTableResource
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

export function getUniqueSpecs(
  build: GraphileBuild.Build,
  resource: PgResource,
  mode: 'resource:update' | 'resource:delete'
) {
  const primaryUnique = resource.uniques.find((u: PgResourceUnique) => u.isPrimary);
  const constraintMode = `constraint:${mode}` as const;
  const specs = [
    ...(primaryUnique &&
    build.getNodeIdCodec !== undefined &&
    build.behavior.pgCodecMatches(resource.codec, `nodeId:${mode}` as const)
      ? [{unique: primaryUnique, uniqueMode: 'node'}]
      : []),
    ...resource.uniques
      .filter((unique: PgResourceUnique) => {
        return build.behavior.pgResourceUniqueMatches([resource, unique], constraintMode);
      })
      .map((unique: PgResourceUnique) => ({
        unique,
        uniqueMode: 'keys',
      })),
  ];
  return specs;
}

export function isNodeIdSpec(
  build: GraphileBuild.Build,
  resource: PgResource,
  mode: 'resource:update' | 'resource:delete'
) {
  const primaryUnique = resource.uniques.find((u: PgResourceUnique) => u.isPrimary);
  if (
    primaryUnique &&
    build.getNodeIdCodec !== undefined &&
    build.getNodeIdHandler !== undefined &&
    build.behavior.pgCodecMatches(resource.codec, `nodeId:${mode}` as const)
  ) {
    return true;
  }
}
