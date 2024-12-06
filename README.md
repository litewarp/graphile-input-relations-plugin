# Graphile Relation Inputs Plugin (i.e., "Nested Mutations" Plugin for Graphile v5)

## A Postgraphile Plugin to Update Nested Relations as Part of a Create or Update Mutation. 

This is a port of the ["Nested Mutations"](https://github.com/mlipscombe/postgraphile-plugin-nested-mutations) plugin for Postgraphile v4. Given the ambiguity regarding the term "nested mutations" (see, e.g., [Benjie's screed on multiple mutations](https://benjie.dev/graphql/nested-mutations)), I've renamed it RelationInputs to more accurately reflect it's purpose.

This plugin adds mutation input fields for your relation inputs. For example, given a schema of:

```graphql
Type School implements Node {
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
