// Maintained policy facts used by support drafting. Keep operational claims in sync
// with approved BookLeaf policy; AI must not imply that a specific action occurred.
const articles = [
  { id: 'royalty_calculation', categories: ['Royalty & Payments'], keywords: ['royalty', 'payment', 'earnings', 'net profit', 'split', 'quarter'], text: 'Royalty split is 80% author / 20% BookLeaf on net profit. Net profit deducts printing cost, platform commission, and shipping from MRP.' },
  { id: 'royalty_schedule', categories: ['Royalty & Payments'], keywords: ['payout', 'paid', 'minimum', 'balance', 'quarterly'], text: 'Royalties are calculated quarterly and paid within 45 days after the quarter ends. Minimum payout is ₹1,000; lower balances roll over. Do not promise a specific payout date without verified account data.' },
  { id: 'isbn_imprint', categories: ['ISBN & Metadata Issues'], keywords: ['isbn', 'imprint', 'publisher'], text: 'BookLeaf-assigned ISBNs use BookLeaf’s publisher imprint. ISBN errors are high priority and escalated to production.' },
  { id: 'metadata_changes', categories: ['ISBN & Metadata Issues'], keywords: ['metadata', 'title', 'author name', 'description', 'listing update'], text: 'Metadata changes typically reflect within 3–5 business days. The actual status of a specific change must be verified.' },
  { id: 'print_quality', categories: ['Printing & Quality'], keywords: ['print', 'printing', 'quality', 'defect', 'damaged', 'reprint'], text: 'Verified printing-quality defects qualify for a free reprint. Verification is required before promising a reprint.' },
  { id: 'print_turnaround', categories: ['Printing & Quality'], keywords: ['print', 'printing', 'turnaround', 'order', 'business days'], text: 'Standard print turnaround is 5–7 business days after order confirmation. Do not claim an order was confirmed unless verified.' },
  { id: 'distribution_listings', categories: ['Distribution & Availability'], keywords: ['distribution', 'listing', 'retailer', 'availability', 'new listing'], text: 'New distribution listings typically take 7–10 business days.' },
  { id: 'stock_sync', categories: ['Distribution & Availability'], keywords: ['stock', 'inventory', 'availability', 're-sync', 'resync'], text: 'Stock re-sync usually takes 24–48 hours. The actual inventory and sync state must be verified.' },
  { id: 'production_stages', categories: ['Book Status & Production Updates'], keywords: ['status', 'production', 'stage', 'editing', 'cover', 'typesetting', 'proofreading'], text: 'Production stages: Manuscript Received, Editing if opted, Cover Design, Typesetting, Proofreading, ISBN Assignment, Printing, Distribution Setup, Published & Live. Delays can involve author approval or proofreading revisions; communicate collaboratively and verify the current stage.' },
  { id: 'general_support', categories: ['General Inquiry'], keywords: ['account', 'help', 'question', 'general'], text: 'For account-specific or unlisted matters, acknowledge the question and explain that a support teammate must verify the relevant account details before confirming an outcome.' }
];

function selectArticles(category, query, limit = 3) {
  const terms = String(query || '').toLowerCase().match(/[a-z0-9₹]+/g) || [];
  return articles.map((article) => ({
    article,
    score: (article.categories.includes(category) ? 4 : 0) + article.keywords.reduce((score, keyword) => score + (terms.some((term) => keyword.includes(term) || term.includes(keyword)) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score).slice(0, limit).map(({ article }) => article);
}

module.exports = { articles, selectArticles, version: '2026-10-22' };
