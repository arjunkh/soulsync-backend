const detectDirectInterest = require('../detectDirectInterest');

describe('detectDirectInterest', () => {
  test('detects direct question about compatibility', () => {
    const result = detectDirectInterest('How do you know when someone is compatible?');
    expect(result.detected).toBe(true);
    expect(result.directQuestion).toBe(true);
  });

  test('detects relationship keywords', () => {
    const result = detectDirectInterest('I am looking for a long term relationship and life together.');
    expect(result.detected).toBe(true);
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  test('detects interest from conversation history', () => {
    const history = [
      { role: 'user', content: 'I want to settle down someday.' }
    ];
    const result = detectDirectInterest('Tell me more about yourself.', history);
    expect(result.detected).toBe(true);
    expect(result.fromHistory).toBe(true);
  });

  test('returns false for unrelated message', () => {
    const result = detectDirectInterest('The weather is nice today.');
    expect(result.detected).toBe(false);
  });
});
