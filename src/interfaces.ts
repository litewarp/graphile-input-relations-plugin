// import type {
//   PgCodec,
//   PgCodecAttribute,
//   PgCodecAttributes,
//   PgDeleteSingleStep,
//   PgInsertSingleStep,
//   PgResourceUnique,
//   PgUpdateSingleStep,
// } from '@dataplan/pg';
// import type {PgTableResource} from '@graphile-contrib/pg-many-to-many';
// import type {} from 'postgraphile';
// import type {pgNestedMutationFields} from './get-nested-relationships.ts';

// export type PgNestedConnectorsInflectionFn = (
//   this: GraphileBuild.Inflection,
//   details: Omit<PgNestedMutationRelationship, 'mutationFields'>
// ) => string;

// export type PgTableRelationship = ReturnType<PgTableResource['getRelations']>[1];

// export type BuildInputObjectArguments = Parameters<
//   GraphileBuild.Build['registerInputObjectType']
// >;

// export interface PgNestedUniqueAttributeCodecs<
//   TAttributes extends PgCodecAttributes = PgCodecAttributes,
// > extends PgResourceUnique<TAttributes> {
//   isNodeId?: boolean;
//   codecs: Record<string, PgCodecAttribute>;
// }

// export type PgNestedDataPlanStep =
//   | PgInsertSingleStep
//   | PgUpdateSingleStep
//   | PgDeleteSingleStep;

// export type PgNestedMutationFieldNames = (typeof pgNestedMutationFields)[number];

// export interface PgNestedMutationFieldDetails {
//   typeName: string;
//   fieldName: string;
// }

// export interface PgNestedTableMutationFields {
//   input: PgNestedMutationFieldDetails;
//   create?: PgNestedMutationFieldDetails;
//   connectByKeys?: PgNestedMutationFieldDetails[];
//   connectByNodeId?: PgNestedMutationFieldDetails;
//   updateByKeys?: PgNestedMutationFieldDetails[];
//   updateByNodeId?: PgNestedMutationFieldDetails;
//   deleteByKeys?: PgNestedMutationFieldDetails[];
//   deleteByNodeId?: PgNestedMutationFieldDetails;
// }

// export interface PgNestedMutationRelationship {
//   fieldName: string;
//   leftTable: PgTableResource;
//   rightTable: PgTableResource;
//   relationName: string;
//   isReverse?: boolean;
//   isUnique?: boolean;
//   localAttributes: readonly string[];
//   remoteAttributes: readonly string[];
//   localUnique: PgNestedUniqueAttributeCodecs;
//   remoteUnique: PgNestedUniqueAttributeCodecs;
//   mutationFields: PgNestedTableMutationFields;
//   tableFieldName: string;
// }

// declare global {
//   // biome-ignore lint/style/noNamespace: idk
//   namespace GraphileBuild {
//     interface BehaviorEntities {
//       pgNestedCreate: PgNestedMutationRelationship;
//     }

//     interface Build {
//       /**
//        *
//        */
//       pgNestedMutationRelationships: Map<PgCodec, PgNestedMutationRelationship[]>;

//       /**
//        * Store of types created to deduplicate
//        */
//       pgNestedMutationInputTypes: Set<string>;

//       // returns the field in the input object
//       // should be tablename for insert
//       // patch for patch
//       pgNestedMutationInputObjMap: Map<string, PgCodec>;

//       //
//     }
//     interface Inflection {
//       /**
//        * Create Fields
//        */
//       nestedCreateFieldName: PgNestedConnectorsInflectionFn;
//       nestedCreateInputType: PgNestedConnectorsInflectionFn;

//       /**
//        * Connect Fields
//        */
//       nestedConnectByNodeIdInputType: PgNestedConnectorsInflectionFn;
//       nestedConnectByNodeIdFieldName: PgNestedConnectorsInflectionFn;
//       nestedConnectByKeyInputType: PgNestedConnectorsInflectionFn;
//       nestedConnectByKeyFieldName: PgNestedConnectorsInflectionFn;
//       /**
//        * Update Fields
//        */
//       nestedUpdateByNodeIdInputType: PgNestedConnectorsInflectionFn;
//       nestedUpdateByNodeIdFieldName: PgNestedConnectorsInflectionFn;
//       nestedUpdateByKeyInputType: PgNestedConnectorsInflectionFn;
//       nestedUpdateByKeyFieldName: PgNestedConnectorsInflectionFn;
//       nestedUpdatePatchType: PgNestedConnectorsInflectionFn;

//       /**
//        * Delete Fields
//        */
//       nestedDeleteByNodeIdInputType: PgNestedConnectorsInflectionFn;
//       nestedDeleteByNodeIdFieldName: PgNestedConnectorsInflectionFn;
//       nestedDeleteByKeyInputType: PgNestedConnectorsInflectionFn;
//       nestedDeleteByKeyFieldName: PgNestedConnectorsInflectionFn;
//       /**
//       /**
//        * Input type and field for the connector
//        */
//       nestedConnectorFieldType: PgNestedConnectorsInflectionFn;
//       nestedConnectorFieldName: PgNestedConnectorsInflectionFn;
//     }

//     interface ScopeInputObject {
//       /**
//        * General Flag for all nested mutation input types
//        */
//       isNestedMutationInputType?: boolean;
//       /**
//        * Indicates that the type is for the create field
//        */
//       isNestedMutationCreateInputType?: boolean;
//       /**
//        * Indicates that the type is for table to codec
//        */
//       isNestedInverseMutation?: boolean;
//       /**
//        * connect_by_key or connect_by_key_a_and_key_b field
//        */
//       isNestedMutationConnectByKeyType?: boolean;
//       /**
//        * connect_by_node_id field
//        */
//       isNestedMutationConnectByNodeIdType?: boolean;
//       /**
//        * type for the relationship field on the parent input
//        * contains all the nested mutation input types
//        */
//       isNestedMutationConnectorType?: boolean;
//       /**
//        * delete_by_key or delete_by_key_a_and_key_b field
//        */
//       isNestedMutationDeleteByKeyType?: boolean;
//       /**
//        * delete_by_node_id field
//        */
//       isNestedMutationDeleteByNodeInputType?: boolean;
//       /**
//        * update_by_key or update_by_key_a_and_key_b field
//        */
//       isNestedMutationUpdateByKeyType?: boolean;
//       /**
//        * update_by_node_id field
//        */
//       isNestedMutationUpdateByNodeIdType?: boolean;
//       /**
//        * patch types for the update field for the foreign input
//        */
//       isNestedMutationPatchType?: boolean;
//       /**
//        * field which resolves to the the connector type
//        */
//       isNestedMutationInputField?: boolean;

//       pgNestedResource?: PgTableResource;
//     }

//     interface ScopeObjectFieldsField {
//       isPgCreateMutationField?: boolean;
//       isPgUpdateMutationField?: boolean;
//       isPgDeleteMutationField?: boolean;
//     }
//   }
// }
