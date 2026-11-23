import { db, FieldValue, CF_BASE, cfHeaders } from '../lib/firebase.js';

export default async function handler(req, res) {
  const { order_id, device_token } = req.query;
  if (!order_id || !device_token) return res.status(400).json({ error: 'Invalid request' });

  try {
    const ref = db.collection('orders').doc(String(order_id));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Order not found' });
    const order = snap.data();
    if (order.deviceToken !== device_token) return res.status(401).json({ error: 'Please open this link in the same browser you paid from, or contact support.' });

    // Ask Cashfree directly: the browser is never trusted for payment status
    const cf = await fetch(`${CF_BASE}/orders/${encodeURIComponent(order_id)}`, { headers: cfHeaders() });
    const data = await cf.json();
    if (data.order_status !== 'PAID') return res.status(200).json({ status: data.order_status || 'UNKNOWN' });
    if (Number(data.order_amount) !== Number(order.amount)) return res.status(409).json({ error: 'Amount mismatch' });

    if (order.status !== 'PAID') await ref.update({ status: 'PAID', paidAt: FieldValue.serverTimestamp() });

    // Private download links live in a collection browsers cannot read
    const items = await Promise.all(order.items.map(async it => {
      const s = await db.collection('private').doc(String(it.id)).get();
      return { name: it.name, url: s.exists ? s.data().downloadUrl || '' : '' };
    }));
    return res.status(200).json({ status: 'PAID', items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
