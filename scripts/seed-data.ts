export const INITIATIVE_NAMES: Record<string, string[]> = {
  "Youth Services": [
    "After School Enrichment", "Summer Youth Pathways", "Teen Leadership Councils", "Youth Mentoring Networks", "Middle School Sports Leagues",
    "Youth Mental Wellness", "Runaway and Homeless Youth Support", "STEM Clubs for Girls", "Youth Media Labs", "Saturday Learning Academies",
    "Youth Violence Interruption", "College Access Advising", "Young Fathers Support", "Youth Civic Engagement", "Foster Youth Transitions",
  ],
  "Older Adults": [
    "Senior Center Programming", "Home Delivered Meals Supplement", "Aging in Place Supports", "Caregiver Respite", "Elder Abuse Prevention",
    "Older Adult Digital Literacy", "Senior Fitness and Falls Prevention", "Social Isolation Outreach", "Grandparents Raising Grandchildren", "Naturally Occurring Retirement Communities",
    "Senior Transportation Access", "Older Adult Benefits Enrollment", "Intergenerational Arts", "Senior Legal Clinics",
  ],
  Education: [
    "Adult Literacy", "Early Childhood Family Literacy", "High School Equivalency Prep", "English for Speakers of Other Languages", "School Based Tutoring",
    "Library Homework Help", "Computer Science for All Families", "Dyslexia Screening and Support", "Parent Leadership Training", "College Persistence Coaching",
    "Bilingual Early Learning", "Community Schools Partnership", "Math Recovery Clinics", "Financial Literacy Education", "Career and Technical Pathways",
  ],
  Health: [
    "Maternal Health Doulas", "Diabetes Prevention", "Community Health Workers", "HIV Prevention and Care", "Asthma Home Visits",
    "Mental Health First Aid", "Substance Use Recovery Navigation", "Cancer Screening Outreach", "Dental Care for Children", "Hepatitis B and C Testing",
    "Food as Medicine", "LGBTQ Health Navigation", "Suicide Prevention", "Hypertension Control", "Lead Poisoning Prevention", "Prenatal Nutrition Support",
  ],
  Housing: [
    "Anti Eviction Legal Services", "Tenant Organizing Support", "Homeless Prevention Rental Aid", "Supportive Housing Case Management", "Housing Court Navigation",
    "Basement Apartment Safety", "Homeownership Counseling", "Foreclosure Prevention", "Shelter Aftercare", "Housing Quality Inspections Outreach",
    "Fair Housing Testing", "Weatherization Assistance", "Single Room Occupancy Supports", "Rapid Rehousing Navigation",
  ],
  Workforce: [
    "Construction Pre Apprenticeship", "Green Jobs Training", "Healthcare Career Ladders", "Justice Involved Reentry Employment", "Small Business Technical Assistance",
    "Worker Cooperative Development", "Domestic Worker Training", "Tech Talent Pipeline", "Culinary Arts Job Training", "Commercial Driver Training",
    "Youth Internship Placements", "Women in Trades", "Immigrant Entrepreneurship", "Day Laborer Centers", "Childcare Provider Training",
  ],
  "Food Security": [
    "Emergency Food Pantries", "Community Fridges", "Urban Farm Distribution", "Halal and Kosher Food Access", "Senior Grocery Delivery",
    "SNAP Enrollment Outreach", "School Weekend Backpacks", "Mobile Markets", "Community Kitchens", "Food Rescue Logistics",
    "Culturally Responsive Food Boxes", "Nutrition Education", "Farmers Market Incentives", "Soup Kitchen Operations",
  ],
  "Immigrant Services": [
    "Immigrant Legal Defense", "Citizenship Application Assistance", "Language Access Interpretation", "New Arrival Navigation", "Unaccompanied Minor Services",
    "Worker Rights Education", "Immigrant Health Access", "Adult Immigrant Literacy", "DACA Renewal Clinics", "Asylum Application Support",
    "Know Your Rights Workshops", "Immigrant Family Reunification", "Community Interpreter Bank", "Consular Document Assistance",
  ],
  "Arts and Culture": [
    "Cultural Immigrant Initiative", "Community Arts Grants", "Coalition of Theaters of Color", "Neighborhood Music Programs", "Public Art in Plazas",
    "Arts in Senior Centers", "Youth Dance Companies", "Local Museum Free Days", "Literary Arts Workshops", "Film Education Labs",
    "Heritage Festivals", "Disability Arts Access", "Library Cultural Programs", "Arts Education in Shelters", "Borough Arts Councils",
  ],
  "Community Safety": [
    "Crisis Management System", "Hospital Violence Intervention", "Gun Violence Prevention Outreach", "Community Mediation Centers", "Safe Passage Programs",
    "Restorative Justice in Schools", "Domestic Violence Survivor Services", "Hate Crimes Prevention", "Victim Services Advocacy", "Youth Diversion",
    "Neighborhood Safety Councils", "Trauma Recovery Centers", "Credible Messenger Mentoring", "Anti Trafficking Outreach",
  ],
  "Legal Services": [
    "Civil Legal Services for Low Income New Yorkers", "Veterans Legal Assistance", "Consumer Debt Defense", "Family Court Representation", "Disability Benefits Advocacy",
    "Wage Theft Recovery", "Elder Law Clinics", "Re Entry Record Sealing", "Domestic Violence Legal Advocacy", "Small Landlord Legal Help",
    "Student Loan Counseling", "Tax Preparation Assistance", "Guardianship Assistance", "Name and Gender Marker Change Clinics",
  ],
  "Parks and Environment": [
    "Neighborhood Parks Stewardship", "Community Gardens Support", "Street Tree Care", "Waterfront Access Programs", "Environmental Justice Monitoring",
    "Composting and Waste Reduction", "Urban Forestry Jobs", "Green Roof Education", "Flood Resilience Outreach", "Clean Air Monitoring",
    "Nature Programs for Children", "Shoreline Cleanup", "Park Equity Programming", "Energy Efficiency Outreach", "Coastal Wetland Restoration",
  ],
};

export const ORG_PREFIXES = [
  "Harborview", "Riverside", "Bridgeway", "Northstar", "Greenpoint Commons", "Linden", "Eastgate", "Westfield", "Brightwater", "Cedar Grove",
  "Hudson Heights", "Ironbound", "Kingsbridge Partners", "Lantern", "Meridian", "New Dawn", "Oakwood", "Parkside", "Queensbridge", "Rockaway Shores",
  "Silverlake", "Tidewater", "Unity", "Valley Stream", "Willow", "Crossroads", "Beacon", "Cornerstone", "Evergreen", "Fairview",
];

export const ORG_SUFFIXES = [
  "Youth Alliance", "Community Services", "Family Center", "Neighborhood Association", "Senior Partners", "Learning Collaborative",
  "Health Network", "Housing Coalition", "Workforce Institute", "Food Collective", "Legal Aid Society", "Arts Project",
];

export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"] as const;

export const BOROUGH_DISTRICTS: Record<(typeof BOROUGHS)[number], number[]> = {
  Manhattan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  Bronx: [8, 11, 12, 13, 14, 15, 16, 17, 18],
  Queens: [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  Brooklyn: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48],
  "Staten Island": [49, 50, 51],
};

export const BOROUGH_ZIPS: Record<(typeof BOROUGHS)[number], string[]> = {
  Manhattan: ["10002", "10009", "10026", "10027", "10029", "10031", "10032", "10035"],
  Bronx: ["10451", "10452", "10453", "10454", "10455", "10456", "10457", "10460"],
  Queens: ["11354", "11368", "11372", "11373", "11385", "11419", "11432", "11691"],
  Brooklyn: ["11201", "11206", "11207", "11211", "11212", "11216", "11221", "11233"],
  "Staten Island": ["10301", "10302", "10303", "10304", "10310", "10314"],
};

export const STREETS = [
  "Grand Concourse", "Atlantic Avenue", "Broadway", "Fulton Street", "Jamaica Avenue", "Victory Boulevard", "Westchester Avenue",
  "Flatbush Avenue", "Amsterdam Avenue", "Roosevelt Avenue", "Southern Boulevard", "Myrtle Avenue", "Forest Avenue", "Lenox Avenue",
];

export const FIRST_NAMES = [
  "Ana", "Marcus", "Grace", "Luis", "Fatima", "Wei", "Tanya", "Andre", "Sofia", "Kwame", "Elena", "Rahul", "Brianna", "Omar",
  "Mei", "Darnell", "Ines", "Samuel", "Yesenia", "Tomas", "Aisha", "Victor", "Rosa", "Ibrahim", "Leah", "Hector", "Nadia", "Kevin",
];

export const LAST_NAMES = [
  "Alvarez", "Brooks", "Chen", "Diallo", "Estrella", "Feliz", "Goldberg", "Haddad", "Ibarra", "Johnson", "Kowalski", "Lopez",
  "Mensah", "Nguyen", "Ortiz", "Patel", "Quinones", "Rivera", "Singh", "Thompson", "Usman", "Vargas", "Williams", "Yusuf", "Zhang",
];

export const TITLES = ["Executive Director", "Program Director", "Finance Manager", "Grants Manager", "Operations Director", "Deputy Director"];

export const PS_LINES = [
  "Program Director (0.5 FTE)", "Program Coordinator", "Case Manager", "Youth Counselor", "Instructor", "Outreach Worker",
  "Data and Evaluation Associate", "Fringe benefits", "Bilingual Navigator", "Peer Advocate",
];

export const OTPS_LINES = [
  "Program supplies and materials", "Participant MetroCards", "Space rental", "Food for participants", "Printing and outreach",
  "Equipment", "Insurance allocation", "Professional development", "Participant stipends", "Software and licenses",
];

export const ACCOMPLISHMENTS = [
  "We exceeded our enrollment goal for the period and opened a second weekday cohort to meet demand from families on our waitlist.",
  "Participants completed the full curriculum at a higher rate than last year, helped by text reminders and evening sessions.",
  "We partnered with two neighborhood schools to recruit participants and held a community showcase attended by local families.",
  "Staff completed trauma-informed care training and we added bilingual materials in Spanish, Bengali and Mandarin.",
  "We reduced our intake wait time from three weeks to five days by adding a walk-in hour and an online pre-screening form.",
];

export const CHALLENGES = [
  "Staff turnover in the first quarter slowed enrollment; we cross-trained two coordinators and recovered by spring.",
  "Our main site closed for repairs for six weeks, so we moved sessions to a partner church and provided MetroCards.",
  "Rising food costs stretched the supplies line; we added a second wholesale vendor and a donated produce partnership.",
  "Some participants lacked reliable internet, so we lent tablets with data plans for remote sessions.",
];

export const STORIES = [
  "A participant who joined unable to read a lease now helps neighbors review theirs at our Saturday clinic.",
  "One teen who started the program after a school suspension was named student of the month in May.",
  "A grandmother caring for three children enrolled in benefits screening and now receives support she did not know existed.",
  "A recent arrival completed our training, earned a food handler certificate, and was hired by a local bakery.",
];
