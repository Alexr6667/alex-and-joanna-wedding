import type { SiteContent } from "./schema";

/**
 * Starting content for the site. Only confirmed facts are filled in; anything
 * not final yet is a visible placeholder. Admins edit the live copy in
 * /admin/content, which is stored in the database and merged over these.
 */
export const DEFAULT_CONTENT: SiteContent = {
  homepageIntro:
    "We're getting married, and we'd love you to celebrate with us. Everything you need for the day is on this page.",
  ceremony: {
    name: "St Johns Church",
    time: "2:00 PM",
    address: "Hyde Park Cres\nTyburnia\nLondon\nW2 2QD",
    notes: "",
  },
  reception: {
    name: "The Larrik",
    time: "From 4:00 PM",
    address: "Marylebone\nLondon",
    notes: "",
  },
  timings: [
    { time: "2:00 PM", label: "Ceremony at St Johns Church" },
    { time: "2:45 PM", label: "Photos and fizz" },
    { time: "4:00 PM", label: "Doors open at The Larrik" },
    { time: "5:00 PM", label: "Dinner" },
    { time: "9:00 PM", label: "Pizza" },
  ],
  dressCode: "Dress code to be confirmed.",
  gettingThere: "Travel details to follow.",
  accommodation: "Suggestions for places to stay will be added here.",
};

export const DEFAULT_WHATSAPP_TEMPLATE = `Hi {first_name},

We're getting married on 28 August 2027 and we'd love you to join us.

You can find all the wedding details and RSVP here:
{link}

Alex & Joanna`;

export const MENU_CATEGORY_DEFAULTS = [
  { key: "arrival_drink", label: "Arrival drink", displayOrder: 1 },
  { key: "starter", label: "Starter", displayOrder: 2 },
  { key: "main", label: "Main", displayOrder: 3 },
  { key: "dessert", label: "Dessert", displayOrder: 4 },
] as const;
