-- ═══ dealerRole backfill — a live row the product can no longer produce ═══
--
-- `User.dealerId` has existed since task-1; `User.dealerRole` arrived with the
-- dealer panel (task-40b). Every environment seeded before that holds dealer
-- owners with `dealerId` set and `dealerRole` NULL.
--
-- That row is unreachable for the product: the only writer (invite acceptance)
-- sets both columns in one statement. But it is READ by two screens, and until
-- today they read different columns -- so the account page offered a "Dealer
-- panel" button and the panel door answered "you are not a member of any
-- dealership". The predicate is now single (src/lib/domain/dealer-membership.ts);
-- this repairs the rows it will now judge.
--
-- Reference and repair data reach a live database by migration, never by seed:
-- the seeder runs once, on an empty database.
--
-- Deliberately narrow: exactly ONE user per dealership is promoted, and only
-- when that dealership has no member with any role at all. Extra legacy rows
-- keep NULL and get the honest "not a member" -- an unreviewed row must never
-- be granted a role by a migration.
UPDATE "User" u
SET "dealerRole" = 'OWNER'::"DealerRole"
WHERE u."dealerRole" IS NULL
  AND u."dealerId" IS NOT NULL
  AND u."role" = 'DEALER'::"UserRole"
  AND NOT EXISTS (
    SELECT 1 FROM "User" m
    WHERE m."dealerId" = u."dealerId" AND m."dealerRole" IS NOT NULL
  )
  AND u."id" = (
    SELECT c."id" FROM "User" c
    WHERE c."dealerId" = u."dealerId"
      AND c."dealerRole" IS NULL
      AND c."role" = 'DEALER'::"UserRole"
    ORDER BY c."createdAt" ASC, c."id" ASC
    LIMIT 1
  );
