import type {PgResource} from '@dataplan/pg';
import type {} from 'graphile-build-pg';
import type {PgTableResource} from '../interfaces.ts';

export function isPgTableResource(r: PgResource): r is PgTableResource {
  return Boolean(r.codec.attributes) && !r.parameters;
}

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
