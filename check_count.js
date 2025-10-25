import db from './db.js';
const count = db.prepare('SELECT COUNT(*) as count FROM items').get();
console.log('Total items:', count.count);
