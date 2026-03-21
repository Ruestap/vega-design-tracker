import { initializeApp } from "firebase/app"; 
import { getFirestore } from "firebase/firestore"; 
const firebaseConfig = { 
  apiKey: "AIzaSyBvmoQCRXIersxf8baH_iruhL6ocsPbY6Q", 
  authDomain: "vega-evidencias.firebaseapp.com", 
  projectId: "vega-evidencias", 
  storageBucket: "vega-evidencias.firebasestorage.app", 
  messagingSenderId: "644406896319", 
  appId: "1:644406896319:web:9b5678c2231744b9b2480a" 
}; 
const app = initializeApp(firebaseConfig); 
export const db = getFirestore(app);
