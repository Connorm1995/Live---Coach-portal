/**
 * Onboarding form definition - mirrors the live Typeform
 * "Connor 2026 - MyFitCoach Onboarding Form" (H4Y0MeYY) exactly, pulled from
 * the Typeform API (fields, options, required flags, and the three logic
 * jumps: gym name for commercial-gym clients, equipment list for home
 * training, allergy detail when "Other" is selected).
 *
 * No scoring, no cycles. Submissions are stored in onboarding_submissions and
 * synced to Trainerize (client creation + invite email) on submit.
 */

const QUESTIONS = [
  { id: 'first_name', kind: 'text', number: 1, required: true,
    question: "What's your first name?" },
  { id: 'surname', kind: 'text', number: 2, required: true,
    question: 'And your surname?' },
  { id: 'email', kind: 'email', number: 3, required: true,
    question: 'Email address',
    hint: 'Your Trainerize invite will be sent here, so double check it.' },
  { id: 'phone', kind: 'phone', number: 4, required: true,
    question: 'Phone number' },
  // invalidMessage is shown on the question when the answer is not a number in
  // range - the usual cause is weight in stone or height in feet and inches.
  { id: 'bodyweight', kind: 'number', number: 5, required: true,
    question: 'Current bodyweight (kg)', min: 30, max: 400,
    invalidMessage: 'Please enter your weight in kilograms, for example 82. If you only know it in stone, multiply by 6.35.' },
  { id: 'height', kind: 'number', number: 6, required: true,
    question: 'Height (cm)', min: 100, max: 250,
    invalidMessage: 'Please enter your height in centimetres, for example 178. 5 foot 10 is about 178cm.' },
  { id: 'dob', kind: 'date', number: 7, required: true,
    question: 'Date of birth' },

  { id: 'main_goal', kind: 'textarea', number: 8, required: true,
    question: "What's your main goal for the next 90 days, and why does it matter to you right now?",
    hint: 'Be specific. "Lose weight" isn\'t a goal. "Drop 8kg by June because of a health scare" or "wedding in 16 weeks" I can work with.' },

  { id: 'training_location', kind: 'multichoice', number: 9, required: true,
    question: 'Where will you be training?',
    hint: 'Select all that apply. If you train in more than one place, pick both.',
    sections: [{ heading: null, options: [
      'Commercial gym', 'Home gym / home setup', 'Outdoors only', 'Not sure yet' ] }] },
  { id: 'which_gym', kind: 'text', number: '9a', required: true,
    conditional: { field: 'training_location', op: 'includes', value: 'Commercial gym' },
    question: 'Name of the commercial gym?' },
  { id: 'home_equipment', kind: 'textarea', number: '9b', required: true,
    conditional: { field: 'training_location', op: 'includes', value: 'Home gym / home setup' },
    question: 'List all the equipment and weights you have available at home.',
    hint: "Be specific. Dumbbells, barbells, cables, bench, rack, bands, etc. If I don't know what you have, I can't programme around it." },

  { id: 'training_days_count', kind: 'choice', number: 10, required: true,
    question: 'How many days per week can you commit to resistance training?',
    options: ['2 days', '3 days', '4 days', '5 days', '6 days'], answerType: 'choice' },
  { id: 'training_days_which', kind: 'multichoice', number: 11, required: true,
    question: 'Which days are available for training?',
    hint: 'Select every day that could work.',
    sections: [{ heading: null, options: [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday' ] }] },
  { id: 'experience', kind: 'choice', number: 12, required: true,
    question: 'How much resistance training experience do you have?',
    options: [
      'Complete beginner (under 6 months)',
      'Some experience (6 months to 2 years)',
      'Intermediate (2 to 4 years)',
      'Experienced (4+ years)' ], answerType: 'choice' },
  { id: 'daily_activity', kind: 'choice', number: 13, required: true,
    question: 'How active are you day to day, outside of structured training?',
    options: [
      'Sedentary, mostly sitting, desk-based',
      'Lightly active, 5,000 to 8,000 steps roughly',
      'Moderately active, on my feet a good bit',
      'Very active, physical job or high daily movement' ], answerType: 'choice' },
  { id: 'injuries', kind: 'textarea', number: 14, required: true,
    question: 'Do you have any injuries, niggles, or health conditions that could affect your training?',
    hint: 'Don\'t downplay anything. Even something minor is worth mentioning so I can work around it. Write "none" if not applicable.' },
  { id: 'work_situation', kind: 'choice', number: 15, required: true,
    question: 'What best describes your work situation?',
    options: [
      'Office or desk-based, fairly fixed hours',
      'Office-based but irregular hours or frequent travel',
      'On my feet or physical work',
      'Work from home',
      'Shift work or highly variable schedule' ], answerType: 'choice' },

  { id: 'sleep_quality', kind: 'scale', number: 16, required: true,
    question: 'How would you rate your sleep quality on average?',
    low: 'Consistently poor', high: 'Consistently great' },
  { id: 'stress_levels', kind: 'scale', number: 17, required: true,
    question: 'How would you rate your stress levels day to day?',
    hint: 'Heads up - 1 means low stress, 10 is high stress.',
    low: 'Very low', high: 'Extremely high' },
  { id: 'digestion', kind: 'scale', number: 18, required: true,
    question: 'How would you rate your digestion?',
    low: 'Poor: bloating, discomfort', high: 'No issues' },

  { id: 'meal_plan_or_tracking', kind: 'choice', number: 19, required: true,
    question: 'Would you prefer to follow a set meal plan or track your food using an app like MyFitnessPal?',
    hint: "No wrong answer. I'll build around whatever works for your lifestyle. Either way, the next few questions help me do that.",
    options: [
      'Set meal plan',
      'Food tracking app (MyFitnessPal)',
      'Not sure, happy to go with whatever you recommend' ], answerType: 'choice' },
  { id: 'typical_eating_day', kind: 'textarea', number: 20, required: true,
    question: "What does a typical day of eating look like for you, when's your first meal, how many times do you eat, and is there any structure to it?",
    hint: 'Don\'t overthink it. Even "I skip breakfast and eat whatever\'s nearby at lunch" tells me what I need to know.' },
  { id: 'who_cooks', kind: 'choice', number: 21, required: true,
    question: 'Who does the cooking in your household?',
    options: [
      'I cook most of the time',
      'Someone else mostly cooks',
      'Mix of both',
      'Mostly convenience food, takeaways, or eating out' ], answerType: 'choice' },
  { id: 'kitchen_comfort', kind: 'choice', number: 22, required: true,
    question: 'How comfortable are you in the kitchen?',
    options: [
      'I enjoy cooking and can follow most recipes',
      'I can put together simple meals',
      'I keep it very basic, minimal effort',
      'I barely cook' ], answerType: 'choice' },
  { id: 'eating_out_freq', kind: 'choice', number: 23, required: true,
    question: 'How often do you eat out or order takeaway per week?',
    options: [
      'Rarely (0 to 1 times)',
      'A few times (2 to 3 times)',
      'Most days (4 to 5 times)',
      'Nearly every meal' ], answerType: 'choice' },
  { id: 'meal_prep', kind: 'choice', number: 24, required: true,
    question: 'How many days per week can you realistically meal prep?',
    options: ["I won't meal prep", '1 day', '2 days', 'Happy to prep most days'], answerType: 'choice' },
  { id: 'alcohol', kind: 'choice', number: 25, required: true,
    question: 'How would you describe your weekly alcohol intake?',
    options: [
      'None', 'Light (1 to 3 drinks)', 'Moderate (4 to 7 drinks)',
      'Heavy (8 to 14 drinks)', 'More than 14 drinks' ], answerType: 'choice' },
  { id: 'eating_habits', kind: 'multichoice', number: 26, required: true,
    question: 'Which of these best describes your current eating habits?',
    hint: 'Select all that apply.',
    sections: [{ heading: null, options: [
      'I eat fairly well but portions are off',
      'I eat well during the week but fall apart on weekends',
      'I snack a lot, especially in the evenings',
      'I skip meals then overeat later',
      'I eat out or order in frequently',
      "No real structure, I eat when I'm hungry",
      'I already track my food' ] }] },
  { id: 'allergies', kind: 'multichoice', number: 27, required: true,
    question: 'Any food allergies or intolerances?',
    sections: [{ heading: null, options: [
      'None', 'Gluten', 'Dairy', 'Nuts', 'Eggs', 'Shellfish', 'Other' ] }] },
  { id: 'allergy_other_specify', kind: 'text', number: '27a', required: true,
    conditional: { field: 'allergies', op: 'includes', value: 'Other' },
    question: 'Please specify your allergy or intolerance.' },
  { id: 'food_preferences', kind: 'textarea', number: 28, required: true,
    question: "Are there foods you'd refuse to eat, or foods you'd hate to lose from your diet?",
    hint: "Be straight with me. If you'd never eat it, I need to know now rather than after I've built your plan around it." },
  { id: 'protein_intake', kind: 'choice', number: 29, required: true,
    question: 'How would you describe your current protein intake?',
    options: [
      'Very low, I rarely think about it',
      'Some, maybe one serving of meat or fish a day',
      "Decent, I'm aware of protein and try to hit it",
      "High, I'm already prioritising it" ], answerType: 'choice' },
  { id: 'nutrition_extra', kind: 'textarea', number: 30, required: false,
    question: 'Anything else I should know about your nutrition before I build your plan?',
    hint: "Upcoming events, previous diets that worked or didn't, family routines, work patterns. Anything that gives me context." },

  { id: 'medical_conditions', kind: 'textarea', number: 31, required: true,
    question: 'Any medical conditions, medications, blood pressure issues, or eating disorder history I should know about before building your plan?',
    hint: 'This stays between us and is purely so I can build something safe and appropriate. Write "none" if not applicable.' },
  { id: 'supplements', kind: 'textarea', number: 32, required: false,
    question: 'Do you currently take any supplements?',
    hint: 'List anything. Protein powder, creatine, vitamins, anything else. Write "none" if not.' },

  { id: 'support_areas', kind: 'multichoice', number: 33, required: true,
    question: 'Where do you need the most support?',
    hint: 'Select all that apply.',
    sections: [{ heading: null, options: [
      'Nutrition and building better habits around food',
      'Training, knowing what to do and how to progress',
      'Consistency and showing up when motivation drops',
      'Accountability, someone checking in and keeping me honest',
      'Mindset and managing stress or emotional eating',
      'Structure, I need a clear plan to follow' ] }] },
  { id: 'coaching_style', kind: 'choice', number: 34, required: true,
    question: "When you're not showing up or things have slipped, how do you want me to handle it?",
    options: [
      'Call it out directly, I respond better to that',
      'Be honest but keep the bigger picture in mind',
      'Help me understand what went wrong rather than just flag it',
      "Leave it to me to be honest with you, I don't need chasing" ], answerType: 'choice' },
  { id: 'held_back', kind: 'textarea', number: 35, required: true,
    question: 'What do you think has held you back most in the past?',
    hint: 'I would like to understand the patterns so we can work around them.' },
  { id: 'anything_else', kind: 'textarea', number: 36, required: false,
    question: 'Is there anything else you want me to know before we start?',
    hint: "Concerns, things you're nervous about, upcoming events, or anything you want flagged before your programme is built." },
];

function conditionMet(cond, answers) {
  if (!cond) return true;
  const v = answers[cond.field];
  if (v == null) return false;
  if (cond.op === 'includes') return Array.isArray(v) && v.indexOf(cond.value) !== -1;
  return cond.op === 'lte' ? v <= cond.value : v >= cond.value;
}

module.exports = { QUESTIONS, conditionMet };
