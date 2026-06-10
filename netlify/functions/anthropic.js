// Proxy sécurisé pour l'API Anthropic
// La clé API est stockée dans les variables d'environnement Netlify - jamais exposée
exports.handler = async function(event, context) {
  // CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Clé API non configurée" }) };
  }

  try {
    const body = JSON.parse(event.body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: body.messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || "Erreur API" })
      };
    }

    // Extraire le JSON de la réponse
    const text = data.content.map(b => b.text || "").join("").trim();
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last < 0) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Réponse invalide", raw: text.slice(0, 200) }) };
    }
    const parsed = JSON.parse(text.slice(first, last + 1));
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
