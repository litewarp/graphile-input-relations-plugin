import type {GraphileBuild} from 'graphile-build';
import type {PgTableResource} from './interfaces.ts';
import type {PgRelationInputData} from './interfaces.ts';
import {isNestedMutableResource} from './utils/resource.ts';

export const getRelationships = (
  build: GraphileBuild.Build,
  localResource: PgTableResource
): PgRelationInputData[] =>
  Object.entries(localResource.getRelations()).reduce((memo, [relationName, details]) => {
    const {remoteResource, isUnique, isReferencee} = details;

    if (!isNestedMutableResource(build, details.remoteResource)) return memo;

    const localAttributes = details.localAttributes.map((key) => {
      const val = localResource.codec.attributes[key];
      if (!val) throw new Error(`Attribute ${key} not found in codec`);
      return {...val, name: key};
    });

    const remoteAttributes = details.remoteAttributes.map((key) => {
      const val = remoteResource.codec.attributes[key];
      if (!val) throw new Error(`Attribute ${key} not found in codec`);
      return {...val, name: key};
    });

    const relationship = {
      relationName,
      fieldName: '', // append it after object is created
      localResource,
      localAttributes,
      remoteAttributes,
      isUnique: isUnique,
      isReferencee: isReferencee,
      remoteResource: remoteResource,
    };
    relationship.fieldName = build.inflection.relationInputField(relationship);

    memo.push(relationship);
    return memo;
  }, [] as PgRelationInputData[]);
