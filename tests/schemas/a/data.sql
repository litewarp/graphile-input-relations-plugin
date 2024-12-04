-- id: 1, nodeId: WyJQYXJlbnQiLDFd
INSERT INTO
  a.parent (parent_name)
VALUES
  ('mom');

-- id: 2, nodeId: WyJQYXJlbnQiLDJd
INSERT INTO
  a.parent (parent_name, email)
VALUES
  ('dad', 'johnny@cochran.com');

-- id: 1, nodeId: WyJDaGlsZCIsMV0=
INSERT INTO
  a.child (mom_parent_id, dad_parent_id, name)
VALUES
  (1, 2, 'child 1');

-- id: 2, nodeId: WyJDaGlsZCIsMl0==
INSERT INTO
  a.child (name)
VALUES
  ('child 2');

-- id: 1, nodeId: 
-- id: 2, nodeId:
-- id: 3, nodeId:
INSERT INTO
  a.school (name)
VALUES
  ('elm'),
  ('pine'),
  ('oak');

INSERT INTO
  a.student (school_id, student_id)
VALUES
  (2, 1);

INSERT INTO
  a.teacher (name, school_id, unique_field)
VALUES
  ('teacher 1', 1, 'random unique field 1'),
  ('teacher 2', 2, 'random unique field 2'),
  ('teacher 3', 3, 'random unique field 3');