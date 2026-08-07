exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { lang, question, content } = JSON.parse(event.body || '{}');

    if (!question) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Question is required' })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured.' })
      };
    }

    const L = content?.[lang] || content?.he || {};
    const guideContext = JSON.stringify(L, null, 2);

    const systemInstruction = `
You are Blue, a friendly and knowledgeable digital concierge for the "Out of the Blue" vacation suite in Nahariya, Israel.

BEHAVIOR RULES:

1. PROPERTY & SUITE QUESTIONS (check-in, rules, pool, amenities, apartment equipment, parking, checkout, host contact):
   - Answer ONLY using the provided PROPERTY GUIDE CONTEXT.
   - If the request is about the property, apartment, or stay, and the exact answer is NOT in the guide context, DO NOT guess or hallucinate. Reply strictly with:
     Hebrew: "סליחה, אבל אין לי מידע לגבי [הנושא]. אני ממליץ/ה ליצור קשר עם המארחים לפרטים נוספים."
     English: "I'm sorry, but I don't have information about [topic]. I suggest contacting the hosts for more details."

2. LOCAL & GENERAL TRAVEL QUESTIONS (gas stations, history of Nahariya, local weather, regional travel advice, Rosh Hanikra safety, nearby attractions, dining recommendations):
   - You MAY answer using your broader knowledge base to assist guests with local travel needs around Nahariya and the Western Galilee.
   - Keep local responses helpful, accurate, polite, and practical.

3. LANGUAGE & TONE:
   - Always respond in ${lang === 'he' ? 'Hebrew' : 'English'}.
   - Maintain a warm, welcoming, and helpful tone.

PROPERTY GUIDE CONTEXT:
${guideContext}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\nGuest Question: ${question}` }]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API Error:', data);
      throw new Error(data.error?.message || 'API request failed');
    }

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    };
  } catch (error) {
    console.error('Concierge Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process request.' })
    };
  }
};
