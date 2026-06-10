// Proxy sécurisé pour Google Drive API
// Les credentials OAuth sont dans les variables d'environnement Netlify
const DB_FILENAME = "famille-healthy-data.json";

exports.handler = async function(event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Le token Google est envoyé par le client (après auth OAuth côté navigateur)
  const authHeader = event.headers["authorization"] || event.headers["Authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Token manquant" }) };
  }
  const googleToken = authHeader.slice(7);

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || event.queryStringParameters?.action;

    if (action === "read") {
      // Chercher le fichier
      const searchResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name%3D'${DB_FILENAME}'%20and%20trashed%3Dfalse&fields=files(id,name,modifiedTime)`,
        { headers: { Authorization: "Bearer " + googleToken } }
      );
      const searchData = await searchResp.json();

      if (!searchData.files || searchData.files.length === 0) {
        // Fichier inexistant - retourner DB vide
        return { statusCode: 200, headers, body: JSON.stringify({ recipes: [], famille: [], version: 2 }) };
      }

      const fileId = searchData.files[0].id;
      const fileResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: "Bearer " + googleToken } }
      );
      const fileData = await fileResp.json();
      return { statusCode: 200, headers, body: JSON.stringify(fileData) };

    } else if (action === "write") {
      const data = body.data;
      const content = JSON.stringify(data, null, 2);

      // Chercher si le fichier existe déjà
      const searchResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name%3D'${DB_FILENAME}'%20and%20trashed%3Dfalse&fields=files(id)`,
        { headers: { Authorization: "Bearer " + googleToken } }
      );
      const searchData = await searchResp.json();

      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      if (fileId) {
        // Mettre à jour le fichier existant
        await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              Authorization: "Bearer " + googleToken,
              "Content-Type": "application/json"
            },
            body: content
          }
        );
      } else {
        // Créer le fichier
        const meta = JSON.stringify({ name: DB_FILENAME, mimeType: "application/json" });
        const boundary = "boundary123";
        const multipart =
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n` +
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
          `--${boundary}--`;

        await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + googleToken,
              "Content-Type": `multipart/related; boundary=${boundary}`
            },
            body: multipart
          }
        );
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Action inconnue: " + action }) };
    }

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
