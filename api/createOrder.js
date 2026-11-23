import crypto from 'node:crypto';
import { db, FieldValue, CF_BASE, CF_SANDBOX, cfHeaders } from '../lib/firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { name, email, phone, items, deviceToken } = req.body || {};

    // 1. Validate input
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Invalid name' });
    if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'Invalid email' });
    if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Invalid phone number' });
    if (!deviceToken || String(deviceToken).length < 16) return res.status(400).json({ error: 'Invalid device' });
    const ids = [...new Set((Array.isArray(items) ? items : []).map(String))].slice(0, 20);
    if (!ids.length) return res.status(400).json({ error: 'Cart is empty' });

    // 2. Read prices from Firestore (never trust the price sent by the browser)
    const snaps = await Promise.all(ids.map(id => db.collection('products').doc(id).get()));
    const products = snaps.filter(s => s.exists && s.data().published).map(s => ({ id: s.id, ...s.data() }));
    if (products.length !== ids.length) return res.status(400).json({ error: 'A product in your cart is unavailable' });
    const amount = Number(products.reduce((t, p) => t + Number(p.price), 0).toFixed(2));
    if (!(amount >= 1)) return res.status(400).json({ error: 'Invalid amount' });

    // 3. Create our order record (doc id = order id)
    const orderId = 'QXZ_' + crypto.randomUUID().replace(/-/g, '');
    await db.collection('orders').doc(orderId).set({
      name: String(name).trim(), email: String(email).trim(), phone: cleanPhone,
      deviceToken: String(deviceToken),
      items: products.map(p => ({ id: p.id, name: p.name, price: Number(p.price) })),
      amount, status: 'CREATED', createdAt: FieldValue.serverTimestamp()
    });

    // 4. Create the Cashfree order
    const site = process.env.SITE_URL || `https://${req.headers.host}`;
    const cf = await fetch(`${CF_BASE}/orders`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: 'C_' + crypto.createHash('sha1').update(String(email).toLowerCase()).digest('hex').slice(0, 20),
          customer_name: String(name).trim(), customer_email: String(email).trim(), customer_phone: cleanPhone
        },
        order_meta: { return_url: `${site}/?order_id={order_id}` }
      })
    });
    const data = await cf.json();

    if (!data.payment_session_id) {
      await db.collection('orders').doc(orderId).update({ status: 'GATEWAY_ERROR' });
      return res.status(502).json({ error: 'Payment gateway error', details: data.message || data });
    }
    return res.status(200).json({ payment_session_id: data.payment_session_id, order_id: orderId, mode: CF_SANDBOX ? 'sandbox' : 'production' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
