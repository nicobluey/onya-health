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
    'a consult outcome by email',
    'a follow-up request from the clinical team',
    'a review outcome after doctor assessment',
    'an update in their patient portal'
];

export const LIVE_ACTIVITY_MESSAGES = LOCATIONS.flatMap((location, locationIndex) =>
    OUTCOMES.map((outcome, outcomeIndex) => {
        const channel = (locationIndex + outcomeIndex) % 2 === 0 ? 'consult portal' : 'secure email';
        return `Consult update: a patient in ${location} received ${outcome} via ${channel}.`;
    })
);
