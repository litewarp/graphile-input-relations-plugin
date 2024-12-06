# Graphile Relation Inputs Plugin (i.e., "Nested Mutations" Plugin for Graphile v5)

## A Postgraphile Plugin to Update Nested Relations as Part of a Create or Update Mutation. 

This is a port of the ["Nested Mutations"](https://github.com/mlipscombe/postgraphile-plugin-nested-mutations) plugin for Postgraphile v4. Given the ambiguity regarding the term "nested mutations" (see, e.g., [Benjie's screed](https://benjie.dev/graphql/nested-mutations)), I've renamed it Relation Inputs to more accurately reflect it's purpose. That is, this plugin allows you to edit related resources in a single mutation graph. Importantly, the plugin utilizes existing step plans to recursively apply mutations down the line. 

Given a schema of:

```graphql
type School implements Node {
  id: ID!
  name: String!

  teachers(
    after: Cursor
    before: Cursor
    condition: TeacherCondition
    first: Int
    last: Int
    offset: Int
    orderBy: [TeacherOrderBy!] = [PRIMARY_KEY_ASC]
  ): TeacherConnection!
}

type Teacher implements Node {
  id: ID!
  name: String!
  schoolId: Int!

  school: School
}

input SchoolInput {
  name: String!
  rowId: Int
}

input TeacherInput {
  name: String!
  rowId: Int
}
```

It adds the following fields to the Input Objects:

```graphql
input TeacherInput {
  name: String!
  otherId: Int
  schoolId: Int!

  school: SchoolByMySchoolIdInput
}

input SchoolByMySchoolIdInput {
  connectById: SchoolByMySchoolIdConnectByNodeIdInput
  create: SchoolByMySchoolIdCreateInput
  deleteById: SchoolByMySchoolIdDeleteByNodeIdInput
  disconnectById: SchoolByMySchoolIdDisconnectByNodeIdInput
  updateById: SchoolByMySchoolIdUpdateByNodeIdInput
}

input SchoolByMySchoolIdConnectByNodeIdInput {
  id: ID!
}

input SchoolByMySchoolIdCreateInput {
  name: String!
  rowId: Int

  teachers: TeachersByTheirSchoolIdInput
}

input SchoolByMySchoolIdDeleteByNodeIdInput {
  id: ID!
}

input SchoolByMySchoolIdDisconnectByNodeIdInput {
  id: ID!
}

input SchoolByMySchoolIdUpdateByNodeIdInput {
  id: ID!
  patch: SchoolPatch!
}

input SchoolInput {
  name: String!

  teachers: TeachersByTheirSchoolIdInput
}

input TeachersByTheirSchoolIdInput {
  connectById: [TeachersByTheirSchoolIdConnectByNodeIdInput!]
  create: [TeachersByTheirSchoolIdCreateInput!]
  deleteById: [TeachersByTheirSchoolIdDeleteByNodeIdInput!]
  disconnectById: [TeachersByTheirSchoolIdDisconnectByNodeIdInput!]
  updateById: [TeachersByTheirSchoolIdUpdateByNodeIdInput!]
}

input TeachersByTheirSchoolIdConnectByNodeIdInput {
  id: ID!
}

input TeachersByTheirSchoolIdCreateInput {
  name: String!
  otherId: Int

  school: SchoolByMySchoolIdInput
  schoolId: Int!
}

input TeachersByTheirSchoolIdDeleteByNodeIdInput {
  id: ID!
}

input TeachersByTheirSchoolIdDisconnectByNodeIdInput {
  id: ID!
}

input TeachersByTheirSchoolIdUpdateByNodeIdInput {
  id: ID!
  patch: TeacherPatch!
}
```

## Warning! This is a work in progress and experimental.

The Following Mutations are Currently Supported

- [x] Create
- [X] ConnectByNodeId
- [X] ConnectByUniqueKeys
- [X] UpdateByNodeId
- [X] UpdateByUniqueKeys
- [ ] DisconnectByNodeId
- [ ] DisconnectByUniqueKeys
- [ ] DeleteByNodeId
- [ ] DeleteByUniqueKeys

TODO:
- [ ] Add semantic version / changesets
- [ ] Migrate tests from [version 4 library](https://github.com/mlipscombe/postgraphile-plugin-nested-mutations/tree/master/__tests__)
- [ ] Make Plugin "Exportable"
- [ ] Use Behaviors ("nested:resource:update", etc.)
- [ ] Use tags (override fieldname)
- [ ] Add config options to limit complexity / recursive depth
- [ ] Publish to JSR?

Shoutout to [Benjie](https://github.com/benjie) and the entire graphile team. This is a small addition to their voluminous efforts.
