// Mock data for one owner with four dental clinics.
// Shapes mirror what the GrowthPro GEO engine and Google Business Profile return,
// so swapping in live data means replacing this module, not the tools.

export type Engine = "chatgpt" | "gemini" | "perplexity";
export type Intent = "discovery" | "service" | "brand";

export interface Location {
  id: string;
  name: string;
  shortName: string; // what the owner says out loud
  city: string;
  gbp: {
    // Google Business Profile facts used for entity validation
    phone: string;
    hours: string;
    services: string[];
    acceptsNewPatients: boolean;
    rating: number;
    reviewCount: number;
  };
  // Weekly GEO score history from previous audit runs, oldest first.
  // This week's score is computed live from THIS_WEEK_RESULTS in scoring.ts.
  scoreHistory: number[];
}

export interface QueryResult {
  locationId: string;
  engine: Engine;
  intent: Intent;
  query: string;
  mentioned: boolean;
  position: number | null; // 1 = first business named
  grounded: boolean; // false = answer came from training data alone (no live sources)
  claims?: { field: keyof Location["gbp"]; value: string | boolean }[];
}

export interface Review {
  id: string;
  locationId: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  postedAt: string; // ISO date
  replied: boolean;
}

export const OWNER = {
  id: "owner_bright_smile",
  name: "Dr. Maya Patel",
  business: "Bright Smile Dental",
  vertical: "dentist",
};

// Perplexity, ChatGPT and Gemini are scored. A fourth engine was dropped from
// scoring because its API failed too often (inconsistent data is worse than less data).
export const ENGINES: Engine[] = ["chatgpt", "gemini", "perplexity"];

export const LOCATIONS: Location[] = [
  {
    id: "loc_downtown",
    name: "Bright Smile Dental – Downtown",
    shortName: "Downtown",
    city: "Austin, TX",
    gbp: {
      phone: "(512) 555-0142",
      hours: "Mon–Fri 8am–6pm, Sat 9am–1pm",
      services: ["cleanings", "invisalign", "implants", "emergency dentistry"],
      acceptsNewPatients: true,
      rating: 4.8,
      reviewCount: 412,
    },
    scoreHistory: [38.75, 40, 42.5, 44, 47, 49.5, 52, 54, 57.5, 60, 62, 65.5, 67, 67.5, 69, 70.5],
  },
  {
    id: "loc_northside",
    name: "Bright Smile Dental – Northside",
    shortName: "Northside",
    city: "Austin, TX",
    gbp: {
      phone: "(512) 555-0177",
      hours: "Mon–Thu 8am–5pm",
      services: ["cleanings", "pediatric dentistry", "crowns"],
      acceptsNewPatients: true,
      rating: 4.6,
      reviewCount: 198,
    },
    scoreHistory: [30, 31, 33, 32, 35, 36, 38, 40, 41, 43, 44],
  },
  {
    id: "loc_riverside",
    name: "Bright Smile Dental – Riverside",
    shortName: "Riverside",
    city: "Round Rock, TX",
    gbp: {
      phone: "(512) 555-0109",
      hours: "Mon–Fri 9am–6pm",
      services: ["cleanings", "veneers", "teeth whitening"],
      acceptsNewPatients: true,
      rating: 4.2,
      reviewCount: 87,
    },
    scoreHistory: [44, 45, 45, 47, 46, 48, 49, 50, 49, 47, 49],
  },
  {
    id: "loc_westlake",
    name: "Bright Smile Dental – Westlake",
    shortName: "Westlake",
    city: "Westlake Hills, TX",
    gbp: {
      phone: "(512) 555-0193",
      hours: "Tue–Sat 8am–4pm",
      services: ["cleanings", "implants", "sedation dentistry"],
      acceptsNewPatients: false,
      rating: 4.9,
      reviewCount: 256,
    },
    scoreHistory: [52, 53, 55, 56, 58, 58, 59, 61, 62, 62, 63],
  },
];

// ---------------------------------------------------------------------------
// This week's raw audit results, generated deterministically so the demo is stable.

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const QUERY_TEMPLATES: Record<Intent, string[]> = {
  discovery: [
    "best dentist near {city}",
    "top rated dental clinic in {city}",
    "dentist open on Saturday in {city}",
    "family dentist {city} accepting new patients",
  ],
  service: [
    "where to get invisalign in {city}",
    "emergency dentist {city}",
    "dental implants cost {city}",
    "teeth whitening {city}",
  ],
  brand: ["Bright Smile Dental {short} reviews", "is Bright Smile Dental {short} good"],
};

// Target non-brand mention rate per location, tuned so this week tells the demo story:
// Downtown is on its 17th run, up from 38.75; Riverside slips after AI engines picked up wrong hours.
const TARGET_RATE: Record<string, number> = {
  loc_downtown: 0.72,
  loc_northside: 0.66,
  loc_riverside: 0.56,
  loc_westlake: 0.74,
};

export const THIS_WEEK_RESULTS: QueryResult[] = (() => {
  const out: QueryResult[] = [];
  LOCATIONS.forEach((loc, li) => {
    const rnd = seeded(1000 + li * 97);
    for (const engine of ENGINES) {
      for (const intent of Object.keys(QUERY_TEMPLATES) as Intent[]) {
        for (const tpl of QUERY_TEMPLATES[intent]) {
          const query = tpl.replace("{city}", loc.city).replace("{short}", loc.shortName);
          // Brand queries almost always mention the brand, which is why we exclude them.
          const p = intent === "brand" ? 0.97 : TARGET_RATE[loc.id];
          const mentioned = rnd() < p;
          out.push({
            locationId: loc.id,
            engine,
            intent,
            query,
            mentioned,
            position: mentioned ? 1 + Math.floor(rnd() * 4) : null,
            grounded: engine === "perplexity" ? true : rnd() > 0.3,
          });
        }
      }
    }
  });
  // A few answers make factual claims we can validate against GBP.
  const claim = (locationId: string, engine: Engine, field: keyof Location["gbp"], value: string | boolean) => {
    const r = out.find((q) => q.locationId === locationId && q.engine === engine && q.mentioned && q.intent !== "brand");
    if (r) (r.claims ??= []).push({ field, value });
  };
  claim("loc_riverside", "chatgpt", "hours", "Open Saturdays 9am–2pm"); // wrong: closed Saturdays
  claim("loc_riverside", "gemini", "phone", "(512) 555-0110"); // wrong number
  claim("loc_westlake", "chatgpt", "acceptsNewPatients", true); // wrong: not accepting
  claim("loc_downtown", "gemini", "services", "invisalign"); // correct
  return out;
})();

// ---------------------------------------------------------------------------

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export const REVIEWS: Review[] = [
  { id: "rev_101", locationId: "loc_riverside", author: "Jason M.", rating: 1, text: "Waited 50 minutes past my appointment time and nobody told me why. Front desk was dismissive.", postedAt: daysAgo(2), replied: false },
  { id: "rev_102", locationId: "loc_riverside", author: "Priya K.", rating: 2, text: "Cleaning was fine but I was billed for x-rays my insurance should have covered. Still waiting on a call back.", postedAt: daysAgo(4), replied: false },
  { id: "rev_103", locationId: "loc_riverside", author: "Tom H.", rating: 5, text: "Dr. Chen was gentle and explained everything. Whitening results are great.", postedAt: daysAgo(5), replied: false },
  { id: "rev_104", locationId: "loc_northside", author: "Alicia R.", rating: 5, text: "My kids actually like going to the dentist now. Thank you!", postedAt: daysAgo(1), replied: false },
  { id: "rev_105", locationId: "loc_northside", author: "Marcus L.", rating: 4, text: "Good care, parking is a bit tricky.", postedAt: daysAgo(6), replied: false },
  { id: "rev_106", locationId: "loc_downtown", author: "Sofia G.", rating: 5, text: "Got an emergency appointment the same day. Lifesavers.", postedAt: daysAgo(3), replied: true },
  { id: "rev_107", locationId: "loc_westlake", author: "Ben T.", rating: 5, text: "Sedation option made my implant painless.", postedAt: daysAgo(8), replied: true },
];

export function findLocation(ref: string): Location | undefined {
  const r = ref.trim().toLowerCase();
  return LOCATIONS.find(
    (l) => l.id === r || l.shortName.toLowerCase() === r || l.name.toLowerCase().includes(r),
  );
}
