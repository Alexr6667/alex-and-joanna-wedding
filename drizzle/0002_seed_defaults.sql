-- Safe defaults only: the settings row (private site, no deadline, menu choices
-- off, content taken from lib/settings/defaults.ts) and the four menu
-- categories with no options. No guests. ON CONFLICT keeps reruns harmless and
-- never overwrites values an admin has changed.
INSERT INTO "site_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "menu_categories" ("key", "label", "display_order") VALUES
	('arrival_drink', 'Arrival drink', 1),
	('starter', 'Starter', 2),
	('main', 'Main', 3),
	('dessert', 'Dessert', 4)
ON CONFLICT ("key") DO NOTHING;
