import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyANFjMRfZ9mwXpBm637H4E3AaYGf_MCtI8",
  authDomain: "vega-desing-tracker.firebaseapp.com",
  projectId: "vega-desing-tracker",
  storageBucket: "vega-desing-tracker.firebasestorage.app",
  messagingSenderId: "176230006788",
  appId: "1:176230006788:web:58de52ed6e1c56fc037551"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
