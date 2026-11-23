import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;

// Set CASHFREE_ENV=sandbox on Vercel to test without real money
export const CF_SANDBOX = process.env.CASHFREE_ENV === 'sandbox';
export const CF_BASE = CF_SANDBOX ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';
export const cfHeaders = () => ({
  'x-api-version': '2023-08-01',
  'x-client-id': process.env.CASHFREE_APP_ID,
  'x-client-secret': process.env.CASHFREE_SECRET_KEY,
  'Content-Type': 'application/json'
});
