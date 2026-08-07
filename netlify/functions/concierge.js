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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OPENAI_API_KEY is not configured.' })
      };
    }

    const L = content?.[lang] || content?.he || {};
    const guideContext = JSON.stringify(L, null, 2);

    const systemInstruction = `
You are Blue, a warm, helpful, and natural digital AI concierge for the "Out of the Blue" vacation suite in Nahariya, Israel.

PERSONALITY & TONE:
- Be friendly, hospitable, and conversational like a real local host.
- Do NOT use rigid, robotic refusal scripts. Keep interactions flowing naturally.

RULES FOR SOURCES:
1. SUITE & PROPERTY QUESTIONS (Check-in, checkout, parking, Wi-Fi, pool, house rules, amenities):
   - Rely primary on the PROPERTY GUIDE CONTEXT.
   - If a guest asks something specific about the suite that isn't in the guide, answer warmly and suggest checking with the host directly.

2. LOCAL AREA, RECOMMENDATIONS & GENERAL KNOWLEDGE (Restaurants, beaches, weather, history, transportation, live recommendations):
   - Act as an expert local guide. Answer freely using your knowledge base and general web-based information.

3. LANGUAGE:
   - Always reply in the user's primary language (${lang === 'he' ? 'Hebrew' : 'English'}).

PROPERTY GUIDE CONTEXT:
${guideContext}
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: question }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API Error:', data);
      throw new Error(data.error?.message || 'API request failed');
    }

    const answer = data.choices?.[0]?.message?.content || '';

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
