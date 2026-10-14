-- On its own: Postgres won't use a new enum value in the transaction that adds it.
ALTER TYPE "Role" ADD VALUE 'super_admin';
