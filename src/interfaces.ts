import type {
  PgCodecAttribute,
  PgCodecRelation,
  PgCodecWithAttributes,
  PgRegistry,
  PgResource,
  PgResourceParameter,
  PgResourceUnique,
} from 'postgraphile/@dataplan/pg';

export interface PgCodecRelationWithName
  extends PgCodecRelation<PgCodecWithAttributes, PgTableResource> {
  name: string;
  resource: string;
}
export interface PgTableResource
  extends PgResource<
    string,
    PgCodecWithAttributes,
    PgResourceUnique[],
    PgResourceParameter[],
    PgRegistry
  > {}

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
export interface PgCodecAttributeWithName extends PgCodecAttribute {
  name: string;
}

export interface PgRelationInputData
  extends PgCodecRelation<PgCodecWithAttributes, PgTableResource> {
  relationName: string;
  fieldName: string;
  localResource: PgTableResource;
  matchedAttributes: {
    local: PgCodecAttributeWithName;
    remote: PgCodecAttributeWithName;
  }[];
}

export interface RelationFieldInfo<TMethod, TMode, TUnique> {
  fieldName: string;
  typeName: string;
  relationName: string;
  method: TMethod;
  mode: TMode;
  unique: TUnique;
}

export type CreateFieldInfo = RelationFieldInfo<'create', undefined, undefined>;

export type ConnectNodeFieldInfo = RelationFieldInfo<
  'connect',
  'node',
  PgResourceUnique
>;

export type ConnectKeysFieldInfo = RelationFieldInfo<
  'connect',
  'keys',
  PgResourceUnique
>;

export type DisconnectNodeFieldInfo = RelationFieldInfo<
  'disconnect',
  'node',
  PgResourceUnique
>;

export type DisconnectKeysFieldInfo = RelationFieldInfo<
  'disconnect',
  'keys',
  PgResourceUnique
>;

export type UpdateNodeFieldInfo = RelationFieldInfo<
  'update',
  'node',
  PgResourceUnique
>;
export type UpdateKeysFieldInfo = RelationFieldInfo<
  'update',
  'keys',
  PgResourceUnique
>;

export type DeleteKeysFieldInfo = RelationFieldInfo<
  'delete',
  'keys',
  PgResourceUnique
>;

export type DeleteNodeFieldInfo = RelationFieldInfo<
  'delete',
  'node',
  PgResourceUnique
>;

export type RelationFieldTypeInfo =
  | ConnectKeysFieldInfo
  | ConnectNodeFieldInfo
  | DeleteKeysFieldInfo
  | DeleteNodeFieldInfo
  | DisconnectKeysFieldInfo
  | DisconnectNodeFieldInfo
  | UpdateKeysFieldInfo
  | UpdateNodeFieldInfo;

export type RelationInputMethods =
  | 'create'
  | 'connect'
  | 'update'
  | 'disconnect'
  | 'delete';

export type RelationInputUniqueModes = 'node' | 'keys';

export type RelationInputTypeInfo<
  TMethod extends RelationInputMethods = RelationInputMethods,
  TMode extends RelationInputUniqueModes = RelationInputUniqueModes,
  TUnion = RelationFieldTypeInfo,
> = TMethod extends 'create'
  ? CreateFieldInfo
  : TMethod extends 'connect'
    ? TMode extends 'node'
      ? ConnectNodeFieldInfo
      : ConnectKeysFieldInfo
    : TMethod extends 'disconnect'
      ? TMode extends 'node'
        ? DisconnectNodeFieldInfo
        : DisconnectKeysFieldInfo
      : TMethod extends 'update'
        ? TMode extends 'node'
          ? UpdateNodeFieldInfo
          : UpdateKeysFieldInfo
        : TMethod extends 'delete'
          ? TMode extends 'node'
            ? DeleteNodeFieldInfo
            : DeleteKeysFieldInfo
          : TUnion;
