export const RATINGS = [
  ['happiness', 'General happiness', 'How happy did you feel overall today?', 'Low', 'Joyful'],
  ['productivity', 'Productivity', 'How much did you feel you actually achieved?', 'Very little', 'A great deal'],
  ['satisfaction', 'Day satisfaction', 'How satisfied are you with how you spent your day?', 'Not at all', 'Completely'],
  ['energy', 'Energy', 'How energetic did you feel?', 'Drained', 'Buzzing'],
  ['social', 'Social fulfilment', 'How much meaningful interaction did you have with other people?', 'None', 'Plenty'],
  ['stress', 'Stress', 'How stressed or overwhelmed did you feel?', 'Calm', 'Overwhelmed'],
  ['enjoyment', 'Enjoyment', 'How much did you genuinely enjoy your day?', 'Not much', 'Loved it'],
];
export const RATING_LABEL = Object.fromEntries(RATINGS.map((r) => [r[0], r[1]]));
export const ACTIVITIES = [
  ['running', 'Running', { distance: true }], ['cycling', 'Cycling', { distance: true }], ['walking', 'Walking', { distance: true }], ['gym', 'Gym', {}],
  ['reading', 'Reading', {}], ['cooking', 'Cooking', {}], ['studying', 'Studying', {}], ['working', 'Working', {}], ['socialising', 'Socialising', {}],
  ['film', 'Watching a film', {}], ['going_out', 'Going out', {}], ['outdoors', 'Time outdoors', {}], ['creative', 'Creative', {}], ['other', 'Other', {}],
];
export const ACT_LABEL = Object.fromEntries(ACTIVITIES.map((a) => [a[0], a[1]]));
export const PROMPTS = [
  ['best', 'What was the best part of today?'], ['did', 'What did you do?'], ['interesting', 'Anything interesting happen?'],
  ['remember', 'What would you like to remember?'], ['differently', 'Anything you wish had gone differently?'],
];
export const excerpt = (l) => {
  const t = (l.reflection || '').trim() || l.prompts?.best || l.prompts?.remember || l.culture?.moment || l.prompts?.did || '';
  if (t) return t;
  const acts = (l.activities || []).map((a) => ACT_LABEL[a.type]).filter(Boolean);
  return acts.length ? acts.join(', ') : 'A quiet day, noted.';
};
