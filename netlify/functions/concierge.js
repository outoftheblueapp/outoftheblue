const { GoogleGenerativeAI } = require('@google/generative-ai');

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

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Flatten app content for context
    const L = content?.[lang] || content?.he || {};
    const guideContext = JSON.stringify(L, null, 2);

    const systemInstruction = `
You are Blue, a friendly and helpful digital concierge for the "Out of the Blue" vacation suite in Nahariya, Israel.

RULES:
1. PROPERTY & SUITE QUESTIONS (check-in, rules, pool, amenities, apartment details, parking, house equipment):
   - Answer ONLY using the provided property guide context below.
   - If the request is about the property/suite/stay and the answer is NOT in the guide context, DO NOT guess or hallucinate. Reply with:
     Hebrew: "סליחה, אבל אין לי מידע לגבי [הנושא]. אני ממליץ/ה ליצור קשר עם המארחים לפרטים נוספים."
     English: "I'm sorry, but I don't have information about [topic]. I suggest contacting the hosts for more details."

2. LOCAL & GENERAL QUESTIONS (history of Nahariya, nearest gas station, attractions, regional safety, general recommendations):
   - You MAY answer using your broader knowledge and web search capabilities to assist the guest with their local travel needs.
   - Keep answers polite, accurate, concise, and helpful.

3. LANGUAGE:
   - Respond in the language specified by the user's setting (${lang === 'he' ? 'Hebrew' : 'English'}).

PROPERTY GUIDE CONTEXT:
${guideContext}
`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction
    });

    const result = await model.generateContent(question);
    const responseText = result.response.text();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: responseText })
    };
  } catch (error) {
    console.error('Concierge Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process request.' })
    };
  }
};
