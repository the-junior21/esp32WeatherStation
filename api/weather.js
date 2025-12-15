// api/weather.js
import admin from "firebase-admin";

function initFirebase() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_ADMIN_CONFIG;
  if (!raw) {
    throw new Error("Missing FIREBASE_ADMIN_CONFIG env variable");
  }

  const serviceAccount = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (serviceAccount.private_key && serviceAccount.private_key.includes("\\n")) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    initFirebase();
  } catch (err) {
    console.error("Firebase init error:", err.message);
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const db = admin.firestore();

  // =========================
  // POST → receive ESP32 data
  // =========================
  if (req.method === "POST") {
    const { temperature, humidity, pressure, rain } = req.body;

    if (
      temperature === undefined ||
      humidity === undefined ||
      pressure === undefined ||
      rain === undefined
    ) {
      return res.status(400).json({
        error: "temperature, humidity, pressure and rain are required",
      });
    }

    try {
      const docRef = await db.collection("weatherData").add({
        temperature,
        humidity,
        pressure,
        rain, // true / false
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Data added:", {
        temperature,
        humidity,
        pressure,
        rain,
      });

      return res.json({ success: true, id: docRef.id });
    } catch (err) {
      console.error("Firestore add error:", err);
      return res.status(500).json({ error: "Failed to store data" });
    }
  }

  // =========================
  // GET → read latest data
  // =========================
  if (req.method === "GET") {
    try {
      const snapshot = await db
        .collection("weatherData")
        .orderBy("timestamp", "desc")
        .limit(20)
        .get();

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return res.json(data);
    } catch (err) {
      console.error("Firestore get error:", err);
      return res.status(500).json({ error: "Failed to retrieve data" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end("Method not allowed");
}
