export const TECH_MANDATORY_QUESTIONS = [
  {
    _id: "primary_user_goal",
    question: "Who will use this product first, and what is the main thing they should be able to do on day one?",
    required: true,
  },
  {
    _id: "first_platform",
    question: "Where should the first version launch: web app, mobile app, admin dashboard, API, or something else?",
    required: true,
  },
  {
    _id: "must_have_features",
    question: "What are the top 3 must-have features for the first usable version?",
    required: true,
  },
  {
    _id: "accounts_payments_data",
    question: "Will the product need user accounts, payments, file uploads, chat, maps, AI, blockchain, or third-party integrations?",
    required: true,
  },
  {
    _id: "constraints",
    question: "Do you have any fixed timeline, budget range, compliance needs, or existing tools/data that the team must work with?",
    required: true,
  },
];

export function getMandatoryQuestion(questionId: string) {
  return TECH_MANDATORY_QUESTIONS.find((question) => question._id === questionId);
}
