import type {GraphileBuild} from 'graphile-build';
import type {} from 'postgraphile/@dataplan/pg';
import type {PgTableResource} from './interfaces.ts';
import type {PgRelationInputData} from './interfaces.ts';

export const getRelationships = (
  build: GraphileBuild.Build,
  localResource: PgTableResource
): PgRelationInputData[] =>
  Object.entries(localResource.getRelations()).reduce(
    (memo, [relationName, relation]) => {
      const relationDetails: GraphileBuild.PgRelationsPluginRelationDetails = {
        registry: build.input.pgRegistry,
        codec: relation.localCodec,
        relationName,
      };
      const singleRecordFieldName = relation.isReferencee
        ? build.inflection.singleRelationBackwards(relationDetails)
        : build.inflection.singleRelation(relationDetails);
      const connectionFieldName =
        build.inflection.manyRelationConnection(relationDetails);

      const relationTypeScope = relation.isUnique
        ? 'singularRelation'
        : 'manyRelation';
      const shouldAddSingleField =
        relation.isUnique &&
        build.behavior.pgCodecRelationMatches(
          relation,
          `${relationTypeScope as 'singularRelation'}:resource:single` as const
        );
      const shouldAddConnectionField = build.behavior.pgCodecRelationMatches(
        relation,
        `${relationTypeScope}:resource:connection`
      );
      const fieldName =
        relation.isUnique && shouldAddSingleField
          ? singleRecordFieldName
          : relation.isReferencee && shouldAddConnectionField
            ? connectionFieldName
            : '';

      const matchedAttributes = relation.localAttributes.map((local, idx) => {
        const remote = relation.remoteAttributes[idx];
        const remoteAttrs = relation.remoteResource.codec.attributes[remote];
        const localAttrs = relation.localCodec.attributes[local];
        if (!localAttrs || !remoteAttrs) {
          throw new Error(
            `Could not find attributes for relation ${relationName}`
          );
        }
        return {
          local: {...localAttrs, name: local},
          remote: {...remoteAttrs, name: remote},
        };
      });

      memo.push({...relation, relationName, fieldName, matchedAttributes});
      return memo;
    },
    [] as PgRelationInputData[]
  );
