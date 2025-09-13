
"use client";
import { useEffect } from "react";
import { collection, getDocs, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function EnvDebug() {
  useEffect(() => {
    const debugFirestore = async () => {
      console.log("🔥 ENV DEBUG → Project ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

      try {
        // Tæl hvor mange dokumenter der er i 'brands'
        const countSnapshot = await getCountFromServer(collection(db, "brands"));
        console.log("📊 Antal dokumenter i 'brands':", countSnapshot.data().count);

        // Hent dokumenterne selv
        const querySnapshot = await getDocs(collection(db, "brands"));
        if (querySnapshot.empty) {
          console.warn("⚠️ Brands collection findes, men ingen dokumenter returneret.");
        } else {
          querySnapshot.forEach((doc) => {
            console.log("🔥 Brand dokument:", doc.id, doc.data());
          });
        }
      } catch (error) {
        console.error("❌ Fejl ved brands debug:", error);
      }
    };

    debugFirestore();
  }, []);

  return <h1>Firestore Collection Debug</h1>;
}
