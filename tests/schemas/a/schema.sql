-- forward nested mutation creates records
DROP SCHEMA if EXISTS a cascade;

CREATE SCHEMA a;

CREATE TABLE a.parent (id serial PRIMARY KEY, parent_name TEXT NOT NULL);

CREATE TABLE a.child (
  id serial PRIMARY KEY,
  mom_parent_id INTEGER,
  dad_parent_id INTEGER,
  name TEXT NOT NULL,
  CONSTRAINT child_mom_parent_fkey FOREIGN key (mom_parent_id) REFERENCES a.parent (id),
  CONSTRAINT child_dad_parent_fkey FOREIGN key (dad_parent_id) REFERENCES a.parent (id)
);

CREATE TABLE a.school (id serial PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE a.student (
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  CONSTRAINT student_child_fkey FOREIGN KEY (student_id) REFERENCES a.child (id),
  CONSTRAINT student_school_fkey FOREIGN key (school_id) REFERENCES a.school (id),
  PRIMARY KEY (school_id, student_id)
);

CREATE TABLE a.teacher (
  other_id serial PRIMARY KEY,
  name TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  CONSTRAINT teacher_school_id_fkey FOREIGN key (school_id) REFERENCES a.school (id)
);

CREATE INDEX ON a.teacher (school_id);

CREATE INDEX ON a.student (school_id);

CREATE INDEX ON a.student (student_id);

CREATE INDEX ON a.child (mom_parent_id);

CREATE INDEX ON a.child (dad_parent_id);