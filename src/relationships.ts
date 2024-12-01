import type {
  PgCodecAttribute,
  PgCodecRelation,
  PgCodecWithAttributes,
} from '@dataplan/pg';
import {type PgTableResource, isNestedMutableResource} from './helpers.ts';

export interface PgCodecAttributeWithName extends PgCodecAttribute {
  name: string;
}

export interface PgRelationInputData
  extends Omit<
    PgCodecRelation<PgCodecWithAttributes, PgTableResource>,
    'localCodec' | 'localAttributes' | 'remoteAttributes'
  > {
  relationName: string;
  fieldName: string;
  localResource: PgTableResource;
  localAttributes: PgCodecAttributeWithName[];
  remoteAttributes: PgCodecAttributeWithName[];
}

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

    return [
      ...memo,
      {
        ...relationship,
        fieldName: build.inflection.relationInputField(relationship),
      },
    ];
  }, [] as PgRelationInputData[]);
