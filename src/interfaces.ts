import type {
  PgCodecRelation,
  PgCodecWithAttributes,
  PgRegistry,
  PgResource,
  PgResourceUnique,
} from 'postgraphile/@dataplan/pg';

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

type BasicFieldInfo = {name: string; type: string};

interface RelationshipKeyMutationFields {
  byKeys?: BasicFieldInfo[];
  byNodeId?: BasicFieldInfo;
}

export interface RelationshipInputFields {
  create?: BasicFieldInfo;
  connect: RelationshipKeyMutationFields;
  update: RelationshipKeyMutationFields;
  delete: RelationshipKeyMutationFields;
}
