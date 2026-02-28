const PEOPLE = [
    'Ava',
    'Noah',
    'Olivia',
    'Liam',
    'Mia',
    'Ethan',
    'Sophie',
    'Lucas',
    'Amelia',
    'Jack',
    'Isla',
    'Leo',
    'Grace',
    'Hudson',
    'Ella',
    'Archer',
    'Ruby',
    'Harvey',
    'Chloe',
    'Finn'
];

const DOCTORS = [
    'Dr. Wilson',
    'Dr. Patel',
    'Dr. Nguyen',
    'Dr. Chen',
    'Dr. Evans'
];

const LOCATIONS = [
    'Melbourne',
    'Sydney',
    'Brisbane',
    'Perth',
    'Adelaide',
    'Gold Coast',
    'Canberra',
    'Hobart',
    'Darwin',
    'Newcastle'
];

const OUTCOMES = [
    'a medical certificate',
    'a same-day consult summary',
    'a doctor-approved treatment note',
    'a verified follow-up plan',
    'their certificate by email',
    'a completed consult outcome'
];

export const LIVE_ACTIVITY_MESSAGES = PEOPLE.flatMap((person, personIndex) =>
    DOCTORS.map((doctor, doctorIndex) => {
        const location = LOCATIONS[(personIndex + doctorIndex * 2) % LOCATIONS.length];
        const outcome = OUTCOMES[(personIndex * 3 + doctorIndex) % OUTCOMES.length];
        return `${person} from ${location} saw ${doctor} and received ${outcome}.`;
    })
);
