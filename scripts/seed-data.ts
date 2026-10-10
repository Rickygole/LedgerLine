export type Category =
  | "Youth Services"
  | "Older Adults"
  | "Education"
  | "Health"
  | "Housing"
  | "Workforce"
  | "Food Security"
  | "Immigrant Services"
  | "Arts and Culture"
  | "Community Safety"
  | "Legal Services"
  | "Parks and Environment";

export const CATEGORIES: Category[] = [
  "Youth Services",
  "Older Adults",
  "Education",
  "Health",
  "Housing",
  "Workforce",
  "Food Security",
  "Immigrant Services",
  "Arts and Culture",
  "Community Safety",
  "Legal Services",
  "Parks and Environment",
];

export const AGENCY_BY_CATEGORY: Record<Category, string> = {
  "Youth Services": "DYCD",
  "Older Adults": "DFTA",
  Education: "DYCD",
  Health: "DOHMH",
  Housing: "HPD",
  Workforce: "SBS",
  "Food Security": "HRA",
  "Immigrant Services": "MOIA",
  "Arts and Culture": "DCLA",
  "Community Safety": "MOCJ",
  "Legal Services": "HRA",
  "Parks and Environment": "DPR",
};

export const COST_PER_PARTICIPANT: Record<Category, [number, number]> = {
  "Youth Services": [600, 2500],
  "Older Adults": [500, 1800],
  Education: [400, 1500],
  Health: [250, 1200],
  Housing: [900, 3500],
  Workforce: [1800, 6000],
  "Food Security": [30, 150],
  "Immigrant Services": [400, 1600],
  "Arts and Culture": [60, 400],
  "Community Safety": [250, 1500],
  "Legal Services": [900, 3000],
  "Parks and Environment": [80, 500],
};

export const ORGS_PER_CATEGORY: Record<Category, number> = {
  "Youth Services": 12,
  "Older Adults": 8,
  Education: 14,
  Health: 9,
  Housing: 7,
  Workforce: 8,
  "Food Security": 9,
  "Immigrant Services": 8,
  "Arts and Culture": 8,
  "Community Safety": 6,
  "Legal Services": 6,
  "Parks and Environment": 6,
};

type NamedInitiative = {
  name: string;
  category: Category;
  awards: [number, number];
  amount: [number, number];
  description: string;
  renamedTo?: string;
  retiredAtRollover?: boolean;
};

export const NAMED_INITIATIVES: NamedInitiative[] = [
  { name: "Mentor Match Network", category: "Youth Services", awards: [6, 8], amount: [60000, 140000], description: "Pairs young people ages 11 to 19 with trained adult mentors and tracks match length, school attendance and goal completion." },
  { name: "Afterschool Studio Program", category: "Youth Services", awards: [7, 9], amount: [45000, 160000], description: "Funds weekday and Saturday studio programming in art, media and science for middle school students." },
  { name: "Summer Launch Stipends", category: "Youth Services", awards: [5, 8], amount: [70000, 220000], description: "Pays stipends to teenagers in summer work placements run by community organizations." },
  { name: "Elder Neighbors Connect", category: "Older Adults", awards: [6, 8], amount: [50000, 180000], description: "Home visits, phone check-ins and group activities for older adults who live alone." },
  { name: "Aging Well Wellness Circles", category: "Older Adults", awards: [5, 7], amount: [40000, 120000], description: "Fitness, falls prevention and nutrition classes held at senior centers and housing developments." },
  { name: "Golden Table Meals Supplement", category: "Older Adults", awards: [4, 6], amount: [60000, 210000], description: "Adds weekend and holiday meals to existing senior meal programs." },
  { name: "Adult Learning Bridge", category: "Education", awards: [10, 12], amount: [30000, 95000], description: "English, reading and high school equivalency classes for adults, with childcare during sessions." },
  { name: "Family Reading Partnerships", category: "Education", awards: [6, 9], amount: [35000, 110000], description: "Early literacy workshops and book distribution for families with children under 8." },
  { name: "Community Wellness Navigators", category: "Health", awards: [7, 10], amount: [55000, 190000], description: "Trained community health workers connect residents to primary care, insurance and screenings." },
  { name: "Early Family Health Visits", category: "Health", awards: [5, 7], amount: [70000, 240000], description: "Prenatal and postpartum home visits for families in neighborhoods with high infant mortality." },
  { name: "Prevention and Screening Outreach", category: "Health", awards: [5, 8], amount: [40000, 150000], description: "Mobile and storefront screenings for blood pressure, diabetes and cancer, with referral follow-up." },
  { name: "Tenant Stability Services", category: "Housing", awards: [6, 8], amount: [65000, 230000], description: "Case management and emergency rental assistance referrals for households facing displacement." },
  { name: "Home Repair Assistance Network", category: "Housing", awards: [4, 5], amount: [80000, 260000], description: "Minor repairs and safety upgrades for low-income homeowners and small building owners." },
  { name: "Skills to Careers Pathways", category: "Workforce", awards: [6, 8], amount: [90000, 320000], description: "Short-term training in healthcare, building trades and technology with job placement support.", renamedTo: "Skills to Careers Network" },
  { name: "Small Shop Growth Support", category: "Workforce", awards: [4, 6], amount: [45000, 150000], description: "Technical assistance for neighborhood storefront businesses on permits, bookkeeping and marketing." },
  { name: "Neighborhood Pantry Support", category: "Food Security", awards: [7, 9], amount: [30000, 130000], description: "Operating support for emergency food pantries, including refrigeration and volunteer coordination." },
  { name: "Fresh Food Access Program", category: "Food Security", awards: [5, 7], amount: [50000, 170000], description: "Produce boxes, mobile markets and cooking demonstrations in areas with few grocery stores.", renamedTo: "Fresh Food Access Initiative" },
  { name: "New Neighbor Navigation", category: "Immigrant Services", awards: [6, 9], amount: [60000, 200000], description: "Orientation, benefits screening and referrals for recent arrivals." },
  { name: "Language Bridge Services", category: "Immigrant Services", awards: [4, 6], amount: [40000, 120000], description: "Interpretation and document translation for residents with limited English proficiency." },
  { name: "Neighborhood Stages Fund", category: "Arts and Culture", awards: [5, 7], amount: [35000, 140000], description: "Supports small theaters and performance spaces that serve local audiences." },
  { name: "Community Arts Studios", category: "Arts and Culture", awards: [6, 9], amount: [25000, 90000], description: "Open studio hours and classes in visual art, music and dance at neighborhood venues." },
  { name: "Safe Blocks Outreach", category: "Community Safety", awards: [5, 7], amount: [90000, 300000], description: "Street outreach and conflict mediation by credible local staff in high-incidence blocks." },
  { name: "Peacekeeper Mediation Network", category: "Community Safety", awards: [4, 5], amount: [60000, 180000], description: "Trained mediators resolve neighbor, family and school disputes before they escalate." },
  { name: "Housing and Benefits Legal Help", category: "Legal Services", awards: [5, 6], amount: [90000, 310000], description: "Free legal representation in housing court and public benefits hearings." },
  { name: "Green Block Stewardship", category: "Parks and Environment", awards: [4, 6], amount: [30000, 100000], description: "Volunteer-led care of street trees, community gardens and small neighborhood green spaces.", renamedTo: "Green Block Stewards" },
  { name: "Clean Waterfront Volunteers", category: "Parks and Environment", awards: [3, 4], amount: [25000, 85000], description: "Shoreline cleanups and environmental education for school groups.", retiredAtRollover: true },
];

export const PREFIXES = [
  "Larkspur", "Marlowe", "Elmcrest", "Brightfield", "Harborlight", "Northgate", "Fairmount", "Pinecrest", "Stonebridge", "Willowmere",
  "Ashgrove", "Bellhaven", "Cobblestone", "Dunmore", "Eastbrook", "Fernhill", "Glenwood", "Hawthorne Square", "Ivywood", "Juniper Lane",
  "Kestrel", "Lindenhurst", "Maplecrest", "Newbridge", "Oakmont", "Pembroke", "Quarry Hill", "Redwood Commons", "Silverbrook", "Thornfield",
  "Upland", "Vantage", "Westmere", "Yarrow", "Zephyr Hill", "Amberly", "Birchwood", "Clearwater", "Driftwood", "Emberly",
  "Foxglove", "Greystone", "Heronsgate", "Inwood Crossing", "Kingfisher", "Lakeshore Point", "Millbrook", "Nightingale", "Orchard Row", "Primrose",
  "Rosedale Park", "Sagebrush", "Tamarack", "Underhill", "Violet Street", "Wrenfield", "Alder Court", "Briarwood", "Cypress Point", "Dovetail",
  "Everton", "Foxhall", "Gatehouse", "Hollis Park", "Iron Hill", "Jasper Court", "Kingsley Row", "Lowell Terrace", "Mosswood", "Norwood Heights",
  "Oriole", "Plover", "Quincy Place", "Ridgeline", "Sunnyfield", "Tidewell", "Umber", "Vesper", "Wexford", "Yewtree",
  "Aldridge", "Beacon Hollow", "Crestline", "Delmar Court", "Elkhorn", "Fieldstone", "Goldfinch", "Havenwood", "Ironwood", "Jubilee Court",
  "Kenwood Park", "Laurel Run", "Meadowbank", "Nettle Hill", "Overlook", "Prospect Row", "Redfern", "Stillwater", "Tallow Street", "Valleyview",
  "Wickham", "Yellowfin", "Ambrose", "Bramble", "Calloway", "Dartmoor", "Esker", "Farrow", "Garnet", "Hadley Court",
];

export const ORG_NOUNS: Record<Category, string[]> = {
  "Youth Services": ["Youth Alliance", "Youth Futures", "Youth Center", "Teen Collaborative", "Youth Development Corps", "Young Leaders Project"],
  "Older Adults": ["Senior Services", "Elder Services", "Older Adult Partnership", "Senior Network", "Aging Services"],
  Education: ["Learning Collaborative", "Literacy Project", "Education Fund", "Family Learning Center", "Adult Learning Institute"],
  Health: ["Health Network", "Family Health Alliance", "Wellness Collaborative", "Community Health Partners"],
  Housing: ["Housing Coalition", "Tenant Alliance", "Housing Services", "Neighborhood Housing Partners"],
  Workforce: ["Workforce Partners", "Career Pathways", "Employment Collaborative", "Skills Institute"],
  "Food Security": ["Food Pantry Network", "Food Partners", "Neighborhood Pantry", "Community Kitchen"],
  "Immigrant Services": ["Immigrant Services", "Newcomer Center", "Immigrant Rights Project", "Welcome Network"],
  "Arts and Culture": ["Arts Collective", "Arts Project", "Cultural Workshop", "Theater Company", "Music Academy"],
  "Community Safety": ["Peace Project", "Safety Network", "Mediation Center", "Violence Prevention Alliance"],
  "Legal Services": ["Legal Services", "Justice Center", "Legal Aid Project", "Advocacy Center"],
  "Parks and Environment": ["Green Alliance", "Parks Conservancy", "Gardens Network", "Environmental Stewards"],
};

export const AGENCY_ORGS: { name: string; category: Category; borough: Borough }[] = [
  { name: "Metropolitan Library Services Authority", category: "Education", borough: "Manhattan" },
  { name: "Community Health Services Corporation", category: "Health", borough: "Bronx" },
  { name: "Borough Cultural Affairs Commission", category: "Arts and Culture", borough: "Brooklyn" },
];

export type Borough = "Bronx" | "Brooklyn" | "Manhattan" | "Queens" | "Staten Island";

export const BOROUGHS: Borough[] = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"];

export const BOROUGH_WEIGHTS: Record<Borough, number> = { Bronx: 22, Brooklyn: 28, Manhattan: 18, Queens: 24, "Staten Island": 8 };

export const BOROUGH_DISTRICTS: Record<Borough, number[]> = {
  Manhattan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  Bronx: [8, 11, 12, 13, 14, 15, 16, 17, 18],
  Queens: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  Brooklyn: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
  "Staten Island": [49, 50, 51],
};

export const BOROUGH_AREA_CODES: Record<Borough, string[]> = {
  Manhattan: ["212", "646"],
  Bronx: ["718", "347"],
  Brooklyn: ["718", "347"],
  Queens: ["718", "347"],
  "Staten Island": ["718", "347"],
};

type Place = { zip: string; city: string; streets: string[] };

export const BOROUGH_PLACES: Record<Borough, Place[]> = {
  Manhattan: [
    { zip: "10027", city: "New York", streets: ["Amsterdam Avenue", "Frederick Douglass Boulevard", "West 125th Street"] },
    { zip: "10029", city: "New York", streets: ["Lexington Avenue", "East 116th Street", "Third Avenue"] },
    { zip: "10002", city: "New York", streets: ["Grand Street", "Delancey Street", "East Broadway"] },
    { zip: "10031", city: "New York", streets: ["Broadway", "St. Nicholas Avenue", "Amsterdam Avenue"] },
    { zip: "10035", city: "New York", streets: ["Second Avenue", "East 125th Street", "Lexington Avenue"] },
  ],
  Bronx: [
    { zip: "10451", city: "Bronx", streets: ["Grand Concourse", "East 149th Street", "Jerome Avenue"] },
    { zip: "10454", city: "Bronx", streets: ["Willis Avenue", "Southern Boulevard", "East 138th Street"] },
    { zip: "10456", city: "Bronx", streets: ["Third Avenue", "East 161st Street", "Webster Avenue"] },
    { zip: "10457", city: "Bronx", streets: ["East Tremont Avenue", "Washington Avenue", "Webster Avenue"] },
    { zip: "10460", city: "Bronx", streets: ["West Farms Road", "Boston Road", "East 174th Street"] },
  ],
  Brooklyn: [
    { zip: "11216", city: "Brooklyn", streets: ["Nostrand Avenue", "Atlantic Avenue", "Bergen Street"] },
    { zip: "11221", city: "Brooklyn", streets: ["Myrtle Avenue", "Broadway", "Knickerbocker Avenue"] },
    { zip: "11207", city: "Brooklyn", streets: ["Pitkin Avenue", "Liberty Avenue", "Fulton Street"] },
    { zip: "11226", city: "Brooklyn", streets: ["Flatbush Avenue", "Nostrand Avenue", "Church Avenue"] },
    { zip: "11232", city: "Brooklyn", streets: ["Third Avenue", "Fourth Avenue", "39th Street"] },
  ],
  Queens: [
    { zip: "11354", city: "Flushing", streets: ["Main Street", "Roosevelt Avenue", "Northern Boulevard"] },
    { zip: "11432", city: "Jamaica", streets: ["Jamaica Avenue", "Hillside Avenue", "Parsons Boulevard"] },
    { zip: "11372", city: "Jackson Heights", streets: ["Roosevelt Avenue", "37th Avenue", "Northern Boulevard"] },
    { zip: "11385", city: "Ridgewood", streets: ["Myrtle Avenue", "Fresh Pond Road", "Seneca Avenue"] },
    { zip: "11691", city: "Far Rockaway", streets: ["Mott Avenue", "Beach 20th Street", "Cornaga Avenue"] },
  ],
  "Staten Island": [
    { zip: "10301", city: "Staten Island", streets: ["Victory Boulevard", "Richmond Terrace", "Bay Street"] },
    { zip: "10304", city: "Staten Island", streets: ["Targee Street", "Bay Street", "Van Duzer Street"] },
    { zip: "10314", city: "Staten Island", streets: ["Forest Avenue", "Victory Boulevard", "Richmond Avenue"] },
  ],
};

export const ORG_FIRST_NAMES = [
  "Alicia", "Marcus", "Fatima", "Luis", "Wei", "Tanya", "Andre", "Sofia", "Kwame", "Elena", "Rahul", "Brianna", "Omar", "Mei", "Darnell",
  "Ines", "Samuel", "Yesenia", "Aisha", "Victor", "Rosa", "Ibrahim", "Leah", "Hector", "Nadia", "Kevin", "Carmen", "Jamal", "Priscilla", "Dmitri",
  "Noor", "Patrice", "Miguel", "Hana", "Terrence", "Valeria", "Anil", "Denise", "Joaquin", "Imani", "Bao", "Camila", "Everton", "Sunita", "Raymond",
  "Gabriela", "Theo", "Lakshmi", "Curtis", "Marisol", "Tariq", "Annika", "Desmond", "Paloma", "Idris", "Beatriz", "Calvin", "Zainab", "Rodrigo", "Maureen",
];

export const ORG_LAST_NAMES = [
  "Alvarez", "Brooks", "Diallo", "Estrella", "Feliz", "Goldberg", "Haddad", "Ibarra", "Johnson", "Kowalski", "Lopez", "Mensah", "Nguyen", "Ortiz",
  "Patel", "Quinones", "Singh", "Thompson", "Usman", "Vargas", "Williams", "Yusuf", "Zhang", "Abernathy", "Banerjee", "Castillo", "Dunleavy", "Okonkwo",
  "Fitzgerald", "Gutierrez", "Hossain", "Jimenez", "Kaplan", "Lindqvist", "Morales", "Nakamura", "Oyelaran", "Petrov", "Rahman", "Salazar", "Tran",
  "Underwood", "Velasquez", "Washington", "Xiong", "Youssef", "Zielinski", "Bellamy", "Cardona", "Delacroix", "Espinoza", "Ferreira", "Gallagher",
  "Holloway", "Iglesias", "Jean-Baptiste", "Kruger", "Lemus", "Montgomery",
];

export const FINANCE_FIRST_NAMES = [
  "Naomi", "Gregory", "Helena", "Raymond", "Simone", "Arthur", "Dolores", "Felix", "Judith", "Winston", "Loretta", "Stanley", "Marguerite", "Philip",
  "Beverly", "Orlando", "Cynthia", "Harold", "Yolanda", "Warren", "Rebecca", "Clifford", "Adaeze", "Lionel",
];

export const FINANCE_LAST_NAMES = [
  "Abramowitz", "Baptiste", "Calderon", "Dempsey", "Eisenberg", "Fontaine", "Grayson", "Hendricks", "Ivanov", "Jankowski", "Kellerman", "Lawson",
  "Mbeki", "Nolan", "Okafor-Reyes", "Pierce", "Quarles", "Rosenthal", "Sandoval", "Teague", "Voss", "Whitfield", "Yamamoto", "Zeller",
];

export const COUNCIL_FIRST_NAMES = [
  "Adrienne", "Bernard", "Carlos", "Delia", "Emmanuel", "Francine", "Gilbert", "Harriet", "Ismael", "Jocelyn", "Kenneth", "Lourdes", "Malcolm", "Nadine",
  "Osvaldo", "Patricia", "Quentin", "Roxanne", "Sebastian", "Teresa", "Ulysses", "Vanessa", "Walter", "Ximena", "Yolanda", "Zachary", "Annabel", "Benedict",
  "Corinne", "Dwayne", "Esperanza", "Franklin", "Gloria", "Hamid", "Irene", "Julian", "Katrina", "Leonard", "Monica", "Nathaniel", "Olivia", "Percy",
  "Rashida", "Stuart", "Tamika", "Vincent", "Wanda", "Alonzo", "Bridget", "Cedric", "Dorothea",
];

export const COUNCIL_LAST_NAMES = [
  "Ashworth", "Bianchi", "Cordero", "Dunbar", "Everhart", "Fairchild", "Galvan", "Hargrove", "Inocencio", "Jorgensen", "Kimura", "Lockhart", "Maldonado",
  "Nwosu", "Oyelowo", "Pennington", "Quintero", "Radcliffe", "Santiago", "Trevino", "Underhill", "Villanueva", "Whitaker", "Yoon", "Zamora", "Acheson",
  "Bouchard", "Castellanos", "Dorsey", "Eastman", "Fuentes", "Greenway", "Halloran", "Isaacs", "Jefferson-Cole", "Kessler", "Lombardi", "Mahoney", "Nikolaidis",
  "Ostrowski", "Pruitt", "Ramsey", "Schuyler", "Tillman", "Ugarte", "Vickers", "Wallace-Reid", "Xavier", "Yancey", "Zeller-Ruiz", "Abbott",
];

export const TITLES = ["Executive Director", "Program Director", "Finance Manager", "Grants Manager", "Operations Director", "Deputy Director", "Development Director"];

export const FINANCE_TITLES = {
  finance_admin: ["Deputy Director", "Unit Head"],
  finance_analyst: ["Budget Analyst", "Senior Budget Analyst", "Financial Analyst"],
  finance_viewer: ["Policy Analyst", "Research Associate", "Program Evaluator"],
};

export const PS_LINES = [
  "Program Director (0.5 FTE)", "Program Coordinator", "Case Manager", "Youth Counselor", "Instructor", "Outreach Worker",
  "Data and Evaluation Associate", "Fringe benefits", "Bilingual Navigator", "Peer Advocate", "Site Supervisor", "Part-time facilitators",
];

export const OTPS_LINES = [
  "Program supplies and materials", "Participant MetroCards", "Space rental", "Food for participants", "Printing and outreach",
  "Equipment", "Insurance allocation", "Professional development", "Participant stipends", "Software and licenses", "Audit and bookkeeping", "Translation services",
];

export const CHALLENGES = [
  "Staff turnover in the first quarter slowed enrollment; we cross-trained two coordinators and recovered by spring.",
  "Our main site closed for repairs for six weeks, so we moved sessions to a partner church and provided MetroCards.",
  "Rising food costs stretched the supplies line; we added a second wholesale vendor and a donated produce partnership.",
  "Some participants lacked reliable internet, so we lent tablets with data plans for remote sessions.",
  "Contract registration took longer than expected, so we advanced program costs from reserves until the first payment arrived.",
  "A boiler failure at our primary site cancelled two weeks of evening sessions; we made them up on Saturdays.",
  "Interest in the program outpaced our capacity and we kept a waitlist of about thirty people.",
  "Two partner sites changed hours, which required us to rework our weekly schedule and notify families.",
];

export const ACCOMPLISHMENTS: Record<Category, string[]> = {
  "Youth Services": [
    "We enrolled {actual} young people this period and added a second weekday cohort to meet demand from families on our waitlist.",
    "Participants attended an average of {hours} hours of programming and our mentors completed trauma-informed practice training.",
    "We partnered with two neighborhood schools to recruit students and held a showcase for families at the end of the term.",
  ],
  "Older Adults": [
    "We served {actual} older adults this period and expanded our weekly check-in calls to residents of two additional buildings.",
    "Our wellness classes now run four days a week and participants report fewer missed medical appointments.",
    "Volunteers from a nearby high school joined our friendly visitor program and paired with {actual} residents.",
  ],
  Education: [
    "We served {actual} learners this period and opened an evening class for working parents.",
    "Most students in our advanced English class moved up a level on the placement assessment at the end of the term.",
    "We added childcare during sessions, which raised attendance among parents of young children.",
  ],
  Health: [
    "We completed {actual} patient contacts this period and strengthened referral links with two community clinics.",
    "Our navigators helped residents enroll in coverage and book overdue screenings at partner clinics.",
    "We trained five new community health workers and began offering Saturday hours at our storefront site.",
  ],
  Housing: [
    "We assisted {actual} households this period and resolved most cases before a court date was set.",
    "Our case managers helped tenants assemble repair requests and connect with emergency rental assistance programs.",
    "We ran four tenant rights workshops in partnership with building associations.",
  ],
  Workforce: [
    "We enrolled {actual} participants this period; most completed training and moved into job search with a coach.",
    "Employer partners hosted site visits and interviews, and several graduates accepted offers before completing the program.",
    "We added a credential preparation course based on feedback from participating employers.",
  ],
  "Food Security": [
    "We distributed food to {actual} households this period and added a second weekly distribution day.",
    "Refrigeration purchased with this award let us accept more fresh produce from local farms and wholesalers.",
    "Volunteers packed and delivered boxes to homebound residents who could not reach the pantry.",
  ],
  "Immigrant Services": [
    "We served {actual} clients this period, with most consultations held in the client's first language.",
    "Weekly orientation sessions brought together recent arrivals and local service providers in one place.",
    "We recruited five new volunteer interpreters and trained them on confidentiality and plain language.",
  ],
  "Arts and Culture": [
    "We held public programs for {actual} participants and audience members this period.",
    "Our spring showcase sold out two evenings and drew first-time visitors from nearby blocks.",
    "Teaching artists introduced new classes in response to requests from returning participants.",
  ],
  "Community Safety": [
    "Our outreach team made {actual} direct contacts this period and mediated disputes before they escalated.",
    "We opened a drop-in space on weekday evenings and hosted two block meetings with local residents.",
    "Staff completed de-escalation training and expanded coverage to two additional blocks.",
  ],
  "Legal Services": [
    "We opened cases for {actual} clients this period and appeared in housing court on their behalf.",
    "Our attorneys held monthly clinics at community sites and screened walk-in clients for benefits issues.",
    "We trained volunteer paralegals to help clients gather documents before hearings.",
  ],
  "Parks and Environment": [
    "Volunteers and staff completed {actual} stewardship activities this period across our partner sites.",
    "We held monthly workdays at three green spaces and trained neighbors to continue the work between events.",
    "School groups joined our plantings and learned how to care for young trees through the first year.",
  ],
};

export const STORIES: Record<Category, string[]> = {
  "Youth Services": ["A student who joined after a rough year at school is now helping lead the younger group on Saturdays.", "One participant earned his first paid summer job through a connection made in the program."],
  "Older Adults": ["A resident who had not left her apartment in months now attends our Thursday class and brings a neighbor.", "A volunteer visitor and an older gentleman discovered they grew up on the same street, and now speak every week."],
  Education: ["A mother who started with the beginner class now reads bedtime stories to her children in English.", "A participant passed his equivalency exam after two attempts and enrolled in a community college course."],
  Health: ["A client who had skipped screenings for years booked and completed a full checkup with our navigator's help.", "A new mother received home visits and was connected to a pediatric clinic near her apartment."],
  Housing: ["A family facing eviction stayed in their home after we helped them document repairs and apply for assistance.", "A tenant association we assisted won repairs to the heating system before winter."],
  Workforce: ["A graduate who had been out of work for a year accepted a full-time position with benefits.", "One participant opened a small catering business after completing our technical assistance sessions."],
  "Food Security": ["A grandmother raising three grandchildren told us the weekly box covers the gap at the end of each month.", "A volunteer who first came as a client now coordinates our Saturday distribution."],
  "Immigrant Services": ["A recent arrival completed intake, enrolled her children in school and found a local English class in one week.", "A client received help with a document deadline that he did not know existed."],
  "Arts and Culture": ["A first-time performer in our youth showcase has since joined the regular ensemble.", "A senior participant showed her first painting at our community exhibition."],
  "Community Safety": ["Two neighbors who had not spoken in a year reached a written agreement through mediation.", "A young man connected through outreach is now enrolled in a job training program."],
  "Legal Services": ["A client's benefits were restored after our attorney prepared the hearing and gathered missing records.", "A tenant who came to a clinic with a court notice was represented and the case was resolved without a judgment."],
  "Parks and Environment": ["Neighbors who joined a single workday now run the monthly cleanup at their park.", "A third-grade class returned to see the trees they planted and measured how much they had grown."],
};
