drop schema if exists b cascade;

create schema b;

create table b.job ( id serial primary key, name text );

create table b.job_relationship (
    type text, from_job_id int REFERENCES b.job (id), to_job_id int REFERENCES b.job (id)
);

create index on b.job_relationship (from_job_id);

create index on b.job_relationship (to_job_id);