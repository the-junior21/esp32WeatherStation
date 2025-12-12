// api/weather.js
import admin from "firebase-admin";

function initFirebase() {
  if (admin.apps.length) return;

  // FIREBASE_ADMIN_CONFIG must contain the full JSON of firebaseAdminConfig.json
  const raw = process.env.FIREBASE_ADMIN_CONFIG;
  if (!raw) {
    throw new Error("Missing FIREBASE_ADMIN_CONFIG env variable");
  }

  // parse and fix newlines in private_key if necessary
  const serviceAccount = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (serviceAccount.private_key && serviceAccount.private_key.includes("\\n")) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(req, res) {
  try {
    initFirebase();
  } catch (err) {
    console.error("Firebase init error:", err.message);
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const db = admin.firestore();

  if (req.method === "POST") {
    const { temperature, humidity } = req.body;
    if (temperature === undefined || humidity === undefined) {
      return res.status(400).json({ error: "Temperature and humidity required" });
    }
    try {
      const docRef = await db.collection("weatherData").add({
        temperature,
        humidity,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Data added:", temperature, humidity);
      return res.json({ success: true, id: docRef.id });
    } catch (err) {
      console.error("Firestore add error:", err);
      return res.status(500).json({ error: "Failed to store data" });
    }
  }

  if (req.method === "GET") {
    try {
      const snapshot = await db.collection("weatherData").orderBy("timestamp", "desc").limit(20).get();
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.json(data);
    } catch (err) {
      console.error("Firestore get error:", err);
      return res.status(500).json({ error: "Failed to retrieve data" });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).end("Method not allowed");
}
