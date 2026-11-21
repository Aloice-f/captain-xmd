
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const aiCommands = [
  {
    name: 'ai',
    aliases: ['ask'],

    run: async ({ sock, msg, jid, args }) => {
      const prompt = args.join(' ').trim();

      if (!prompt) {
        throw new Error('Usage: .ai ask your question');
      }

      const apiKey = process.env.GROQ_API_KEY;
      const model =
        process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

      if (!apiKey) {
        throw new Error(
          'AI is not configured. Contact the Captain Bot administrator.'
        );
      }

      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(45000),

        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are Captain Bot, a helpful and concise assistant. ' +
                'Give clear, accurate answers. Do not assist with wrongdoing.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 700
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error(
          'Groq request failed:',
          response.status,
          data.error?.message || 'Unknown API error'
        );

        throw new Error(
          'The AI service is temporarily unavailable. Try again later.'
        );
      }

      const answer = data.choices?.[0]?.message?.content?.trim();

      if (!answer) {
        throw new Error('The AI service returned an empty response.');
      }

      await sock.sendMessage(
        jid,
        { text: answer },
        { quoted: msg }
      );
    }
  }
];
