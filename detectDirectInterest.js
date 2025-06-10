function detectDirectInterest(message, userHistory = []) {
  const msg = message.toLowerCase();

  const relationshipKeywords = [
    'future', 'marriage', 'relationship', 'compatibility', 'partner',
    'family planning', 'life together', 'settle down', 'serious relationship',
    'long term', 'commitment', 'values', 'life goals', 'future plans',
    'couple compass', 'compatibility quiz', 'relationship test',
    'matchmaking service', 'compatibility questionnaire', 'ready for love',
    'looking for someone', 'ideal partner', 'relationship values',
    'what i want in', 'future together', 'building a life'
  ];

  const matchedKeywords = relationshipKeywords.filter(keyword => msg.includes(keyword));

  const directQuestions = [
    'what makes relationships work', 'how do you know compatibility',
    'what do you look for', 'ideal relationship', 'relationship values',
    'ready for something serious', 'looking for long term',
    'what matters in love', 'relationship goals', 'perfect match'
  ];

  const directQuestionDetected = directQuestions.some(question => msg.includes(question));

  const historyKeywords = userHistory.slice(-3).some(entry => {
    if (entry.role !== 'user') return false;
    const content = (entry.content || '').toLowerCase();
    return relationshipKeywords.some(keyword => content.includes(keyword));
  });

  return {
    detected: matchedKeywords.length > 0 || directQuestionDetected || historyKeywords,
    keywords: matchedKeywords,
    directQuestion: directQuestionDetected,
    fromHistory: historyKeywords,
    strength: matchedKeywords.length > 1 ? 'strong' : 'medium'
  };
}

module.exports = detectDirectInterest;
