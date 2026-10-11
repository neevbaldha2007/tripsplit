/**
 * TripSplit — Local Development Server
 * Zero-dependency Node.js HTTP server.
 * Serves static web assets and provides real-time API simulation for api/*.php
 * Allows testing the entire app locally on http://localhost:8000 without requiring XAMPP setup first.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const PUBLIC_DIR = __dirname;

// In-Memory Database matching database.sql schema
const db = {
    trips: [
        {
            id: 1,
            name: 'Goa Trip',
            destination: 'Goa, India',
            start_date: '2026-11-01',
            end_date: '2026-11-05',
            created_at: new Date().toISOString()
        }
    ],
    members: [
        { id: 1, trip_id: 1, name: 'Neev' },
        { id: 2, trip_id: 1, name: 'Rahul' },
        { id: 3, trip_id: 1, name: 'Jeel' }
    ],
    expenses: [
        {
            id: 1,
            trip_id: 1,
            description: 'Beachside Resort Hotel',
            amount_paise: 300000,
            category: 'Hotel',
            payer_member_id: 1,
            expense_date: '2026-11-01',
            split_type: 'equal',
            created_at: new Date().toISOString()
        },
        {
            id: 2,
            trip_id: 1,
            description: 'Seafood Dinner at Shack',
            amount_paise: 150000,
            category: 'Food',
            payer_member_id: 2,
            expense_date: '2026-11-02',
            split_type: 'equal',
            created_at: new Date().toISOString()
        },
        {
            id: 3,
            trip_id: 1,
            description: 'Scooter Rental & Fuel',
            amount_paise: 150000,
            category: 'Transport',
            payer_member_id: 3,
            expense_date: '2026-11-02',
            split_type: 'equal',
            created_at: new Date().toISOString()
        }
    ],
    expense_shares: [
        { id: 1, expense_id: 1, member_id: 1, share_paise: 100000 },
        { id: 2, expense_id: 1, member_id: 2, share_paise: 100000 },
        { id: 3, expense_id: 1, member_id: 3, share_paise: 100000 },
        { id: 4, expense_id: 2, member_id: 1, share_paise: 50000 },
        { id: 5, expense_id: 2, member_id: 2, share_paise: 50000 },
        { id: 6, expense_id: 2, member_id: 3, share_paise: 50000 },
        { id: 7, expense_id: 3, member_id: 1, share_paise: 50000 },
        { id: 8, expense_id: 3, member_id: 2, share_paise: 50000 },
        { id: 9, expense_id: 3, member_id: 3, share_paise: 50000 }
    ],
    settlements: []
};

let nextIds = {
    trips: 2,
    members: 4,
    expenses: 4,
    expense_shares: 10,
    settlements: 1
};

// Helper: send JSON response
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Helper: parse request body
function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });
}

// Debt Simplification Algorithm
function calculateSettlementSuggestions(memberBalances) {
    const debtors = [];
    const creditors = [];

    for (const m of memberBalances) {
        const bal = m.balance_paise;
        if (bal < 0) {
            debtors.push({ id: m.id, name: m.name, amount: Math.abs(bal) });
        } else if (bal > 0) {
            creditors.push({ id: m.id, name: m.name, amount: bal });
        }
    }

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const suggestions = [];
    let d = 0, c = 0;

    while (d < debtors.length && c < creditors.length) {
        const transfer = Math.min(debtors[d].amount, creditors[c].amount);
        if (transfer > 0) {
            suggestions.push({
                sender_id: debtors[d].id,
                sender_name: debtors[d].name,
                receiver_id: creditors[c].id,
                receiver_name: creditors[c].name,
                amount_paise: transfer,
                amount_rupees: Math.round(transfer) / 100
            });
            debtors[d].amount -= transfer;
            creditors[c].amount -= transfer;
        }
        if (debtors[d].amount === 0) d++;
        if (creditors[c].amount === 0) c++;
    }

    return suggestions;
}

// MIME Types
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // API Routing
    if (pathname.startsWith('/api/')) {
        const body = (req.method === 'POST' || req.method === 'PUT') ? await parseBody(req) : {};

        // 1. Trips API (/api/trips.php)
        if (pathname === '/api/trips.php') {
            if (req.method === 'GET') {
                if (query.id) {
                    const tripId = parseInt(query.id, 10);
                    const trip = db.trips.find(t => t.id === tripId);
                    if (!trip) return sendJson(res, 404, { success: false, message: 'Trip not found' });
                    
                    const memberCount = db.members.filter(m => m.trip_id === tripId).length;
                    const totalPaise = db.expenses.filter(e => e.trip_id === tripId).reduce((sum, e) => sum + e.amount_paise, 0);
                    return sendJson(res, 200, {
                        success: true,
                        data: {
                            ...trip,
                            member_count: memberCount,
                            total_expenses_paise: totalPaise,
                            total_expenses_rupees: Math.round(totalPaise) / 100
                        }
                    });
                } else {
                    const tripsWithStats = db.trips.map(trip => {
                        const memberCount = db.members.filter(m => m.trip_id === trip.id).length;
                        const totalPaise = db.expenses.filter(e => e.trip_id === trip.id).reduce((sum, e) => sum + e.amount_paise, 0);
                        return {
                            ...trip,
                            member_count: memberCount,
                            total_expenses_paise: totalPaise,
                            total_expenses_rupees: Math.round(totalPaise) / 100
                        };
                    });
                    return sendJson(res, 200, { success: true, data: tripsWithStats });
                }
            } else if (req.method === 'POST') {
                const tripId = nextIds.trips++;
                const newTrip = {
                    id: tripId,
                    name: body.name || 'Untitled Trip',
                    destination: body.destination || 'Destination',
                    start_date: body.start_date || null,
                    end_date: body.end_date || null,
                    created_at: new Date().toISOString()
                };
                db.trips.unshift(newTrip);

                if (Array.isArray(body.members)) {
                    body.members.forEach(name => {
                        if (name && name.trim()) {
                            db.members.push({ id: nextIds.members++, trip_id: tripId, name: name.trim() });
                        }
                    });
                }
                return sendJson(res, 201, { success: true, data: newTrip });
            } else if (req.method === 'PUT') {
                const trip = db.trips.find(t => t.id === parseInt(body.id, 10));
                if (!trip) return sendJson(res, 404, { success: false, message: 'Trip not found' });
                trip.name = body.name || trip.name;
                trip.destination = body.destination || trip.destination;
                trip.start_date = body.start_date || trip.start_date;
                trip.end_date = body.end_date || trip.end_date;
                return sendJson(res, 200, { success: true, data: trip });
            } else if (req.method === 'DELETE') {
                const tripId = parseInt(query.id || body.id, 10);
                db.trips = db.trips.filter(t => t.id !== tripId);
                db.members = db.members.filter(m => m.trip_id !== tripId);
                const exps = db.expenses.filter(e => e.trip_id === tripId);
                const expIds = exps.map(e => e.id);
                db.expenses = db.expenses.filter(e => e.trip_id !== tripId);
                db.expense_shares = db.expense_shares.filter(s => !expIds.includes(s.expense_id));
                db.settlements = db.settlements.filter(s => s.trip_id !== tripId);
                return sendJson(res, 200, { success: true, message: 'Trip deleted' });
            }
        }

        // 2. Members API (/api/members.php)
        if (pathname === '/api/members.php') {
            if (req.method === 'GET') {
                const tripId = parseInt(query.trip_id, 10);
                const tripMembers = db.members.filter(m => m.trip_id === tripId).map(m => {
                    const expPaid = db.expenses.filter(e => e.payer_member_id === m.id).length;
                    const shares = db.expense_shares.filter(s => s.member_id === m.id).length;
                    const settles = db.settlements.filter(s => s.sender_member_id === m.id || s.receiver_member_id === m.id).length;
                    return {
                        ...m,
                        expenses_paid_count: expPaid,
                        shares_count: shares,
                        settlements_count: settles,
                        has_financial_records: (expPaid > 0 || shares > 0 || settles > 0)
                    };
                });
                return sendJson(res, 200, { success: true, data: tripMembers });
            } else if (req.method === 'POST') {
                const tripId = parseInt(body.trip_id, 10);
                const name = (body.name || '').trim();
                const exists = db.members.some(m => m.trip_id === tripId && m.name.toLowerCase() === name.toLowerCase());
                if (exists) return sendJson(res, 409, { success: false, message: 'Member already exists in trip' });

                const newMember = { id: nextIds.members++, trip_id: tripId, name };
                db.members.push(newMember);
                return sendJson(res, 201, { success: true, data: newMember });
            } else if (req.method === 'PUT') {
                const member = db.members.find(m => m.id === parseInt(body.id, 10));
                if (!member) return sendJson(res, 404, { success: false, message: 'Member not found' });
                member.name = (body.name || '').trim();
                return sendJson(res, 200, { success: true, data: member });
            } else if (req.method === 'DELETE') {
                const memberId = parseInt(query.id || body.id, 10);
                const expPaid = db.expenses.filter(e => e.payer_member_id === memberId).length;
                const shares = db.expense_shares.filter(s => s.member_id === memberId).length;
                const settles = db.settlements.filter(s => s.sender_member_id === memberId || s.receiver_member_id === memberId).length;

                if (expPaid > 0 || shares > 0 || settles > 0) {
                    return sendJson(res, 422, {
                        success: false,
                        message: `Cannot delete member: active financial records exist (${expPaid} expenses, ${shares} shares, ${settles} settlements).`
                    });
                }
                db.members = db.members.filter(m => m.id !== memberId);
                return sendJson(res, 200, { success: true, message: 'Member removed' });
            }
        }

        // 3. Expenses API (/api/expenses.php)
        if (pathname === '/api/expenses.php') {
            if (req.method === 'GET') {
                const tripId = parseInt(query.trip_id, 10);
                let tripExpenses = db.expenses.filter(e => e.trip_id === tripId);

                if (query.category) tripExpenses = tripExpenses.filter(e => e.category === query.category);
                if (query.payer_id) tripExpenses = tripExpenses.filter(e => e.payer_member_id === parseInt(query.payer_id, 10));
                if (query.search) {
                    const q = query.search.toLowerCase();
                    tripExpenses = tripExpenses.filter(e => e.description.toLowerCase().includes(q));
                }

                const result = tripExpenses.map(e => {
                    const payer = db.members.find(m => m.id === e.payer_member_id);
                    const shares = db.expense_shares.filter(s => s.expense_id === e.id).map(s => {
                        const m = db.members.find(mem => mem.id === s.member_id);
                        return {
                            ...s,
                            member_name: m ? m.name : 'Unknown',
                            share_rupees: Math.round(s.share_paise) / 100
                        };
                    });
                    return {
                        ...e,
                        payer_name: payer ? payer.name : 'Unknown',
                        amount_rupees: Math.round(e.amount_paise) / 100,
                        shares
                    };
                });
                return sendJson(res, 200, { success: true, data: result });
            } else if (req.method === 'POST') {
                const tripId = parseInt(body.trip_id, 10);
                const amountPaise = body.amount_paise || Math.round((parseFloat(body.amount_rupees || 0)) * 100);
                const expenseId = nextIds.expenses++;

                const newExp = {
                    id: expenseId,
                    trip_id: tripId,
                    description: body.description || 'Expense',
                    amount_paise: amountPaise,
                    category: body.category || 'Other',
                    payer_member_id: parseInt(body.payer_member_id, 10),
                    expense_date: body.expense_date || new Date().toISOString().substring(0, 10),
                    split_type: body.split_type || 'equal',
                    created_at: new Date().toISOString()
                };
                db.expenses.unshift(newExp);

                // Compute shares
                if (newExp.split_type === 'equal') {
                    const pList = body.participants || [];
                    const n = pList.length;
                    const basePaise = Math.floor(amountPaise / n);
                    const remainder = amountPaise % n;
                    pList.forEach((mId, idx) => {
                        db.expense_shares.push({
                            id: nextIds.expense_shares++,
                            expense_id: expenseId,
                            member_id: parseInt(mId, 10),
                            share_paise: basePaise + (idx < remainder ? 1 : 0)
                        });
                    });
                } else {
                    const pList = body.participants || [];
                    pList.forEach(p => {
                        db.expense_shares.push({
                            id: nextIds.expense_shares++,
                            expense_id: expenseId,
                            member_id: parseInt(p.member_id, 10),
                            share_paise: parseInt(p.share_paise, 10)
                        });
                    });
                }

                return sendJson(res, 201, { success: true, data: newExp });
            } else if (req.method === 'PUT') {
                const expId = parseInt(body.id, 10);
                const exp = db.expenses.find(e => e.id === expId);
                if (!exp) return sendJson(res, 404, { success: false, message: 'Expense not found' });

                const amountPaise = body.amount_paise || Math.round((parseFloat(body.amount_rupees || 0)) * 100);
                exp.description = body.description || exp.description;
                exp.amount_paise = amountPaise;
                exp.category = body.category || exp.category;
                exp.payer_member_id = parseInt(body.payer_member_id, 10);
                exp.expense_date = body.expense_date || exp.expense_date;
                exp.split_type = body.split_type || exp.split_type;

                // Delete old shares
                db.expense_shares = db.expense_shares.filter(s => s.expense_id !== expId);

                // Insert new shares
                if (exp.split_type === 'equal') {
                    const pList = body.participants || [];
                    const n = pList.length;
                    const basePaise = Math.floor(amountPaise / n);
                    const remainder = amountPaise % n;
                    pList.forEach((mId, idx) => {
                        db.expense_shares.push({
                            id: nextIds.expense_shares++,
                            expense_id: expId,
                            member_id: parseInt(mId, 10),
                            share_paise: basePaise + (idx < remainder ? 1 : 0)
                        });
                    });
                } else {
                    const pList = body.participants || [];
                    pList.forEach(p => {
                        db.expense_shares.push({
                            id: nextIds.expense_shares++,
                            expense_id: expId,
                            member_id: parseInt(p.member_id, 10),
                            share_paise: parseInt(p.share_paise, 10)
                        });
                    });
                }
                return sendJson(res, 200, { success: true, data: exp });
            } else if (req.method === 'DELETE') {
                const expId = parseInt(query.id || body.id, 10);
                db.expenses = db.expenses.filter(e => e.id !== expId);
                db.expense_shares = db.expense_shares.filter(s => s.expense_id !== expId);
                return sendJson(res, 200, { success: true, message: 'Expense deleted' });
            }
        }

        // 4. Balances API (/api/balances.php)
        if (pathname === '/api/balances.php') {
            const tripId = parseInt(query.trip_id, 10);
            const trip = db.trips.find(t => t.id === tripId);
            if (!trip) return sendJson(res, 404, { success: false, message: 'Trip not found' });

            const tripMembers = db.members.filter(m => m.trip_id === tripId);
            let totalTripExpensesPaise = 0;
            let balanceSumPaise = 0;

            const memberBalances = tripMembers.map(m => {
                // Paid
                const paidPaise = db.expenses
                    .filter(e => e.trip_id === tripId && e.payer_member_id === m.id)
                    .reduce((sum, e) => sum + e.amount_paise, 0);

                // Share
                const expIds = db.expenses.filter(e => e.trip_id === tripId).map(e => e.id);
                const sharePaise = db.expense_shares
                    .filter(s => expIds.includes(s.expense_id) && s.member_id === m.id)
                    .reduce((sum, s) => sum + s.share_paise, 0);

                // Repayments Sent
                const sentPaise = db.settlements
                    .filter(s => s.trip_id === tripId && s.sender_member_id === m.id && s.status === 'completed')
                    .reduce((sum, s) => sum + s.amount_paise, 0);

                // Repayments Received
                const recvPaise = db.settlements
                    .filter(s => s.trip_id === tripId && s.receiver_member_id === m.id && s.status === 'completed')
                    .reduce((sum, s) => sum + s.amount_paise, 0);

                // Net Balance = Paid - Share + Sent - Received
                const netBalPaise = paidPaise - sharePaise + sentPaise - recvPaise;
                balanceSumPaise += netBalPaise;

                return {
                    id: m.id,
                    name: m.name,
                    paid_paise: paidPaise,
                    paid_rupees: Math.round(paidPaise) / 100,
                    share_paise: sharePaise,
                    share_rupees: Math.round(sharePaise) / 100,
                    repayments_sent_paise: sentPaise,
                    repayments_sent_rupees: Math.round(sentPaise) / 100,
                    repayments_received_paise: recvPaise,
                    repayments_received_rupees: Math.round(recvPaise) / 100,
                    balance_paise: netBalPaise,
                    balance_rupees: Math.round(netBalPaise) / 100,
                    status: netBalPaise > 0 ? 'gets_back' : (netBalPaise < 0 ? 'owes' : 'settled')
                };
            });

            totalTripExpensesPaise = db.expenses.filter(e => e.trip_id === tripId).reduce((sum, e) => sum + e.amount_paise, 0);

            // Categories
            const catMap = {};
            db.expenses.filter(e => e.trip_id === tripId).forEach(e => {
                if (!catMap[e.category]) catMap[e.category] = { count: 0, total_paise: 0 };
                catMap[e.category].count++;
                catMap[e.category].total_paise += e.amount_paise;
            });

            const categoryBreakdown = Object.keys(catMap).map(cat => {
                const cPaise = catMap[cat].total_paise;
                return {
                    category: cat,
                    count: catMap[cat].count,
                    total_paise: cPaise,
                    total_rupees: Math.round(cPaise) / 100,
                    percentage: totalTripExpensesPaise > 0 ? Math.round((cPaise / totalTripExpensesPaise) * 1000) / 10 : 0
                };
            }).sort((a, b) => b.total_paise - a.total_paise);

            const suggestions = calculateSettlementSuggestions(memberBalances);

            return sendJson(res, 200, {
                success: true,
                data: {
                    trip: {
                        ...trip,
                        total_expenses_paise: totalTripExpensesPaise,
                        total_expenses_rupees: Math.round(totalTripExpensesPaise) / 100,
                        member_count: tripMembers.length
                    },
                    member_balances: memberBalances,
                    balance_sum_paise: balanceSumPaise,
                    suggestions,
                    is_fully_settled: suggestions.length === 0,
                    category_breakdown: categoryBreakdown
                }
            });
        }

        // 5. Settlements API (/api/settlements.php)
        if (pathname === '/api/settlements.php') {
            if (req.method === 'GET') {
                const tripId = parseInt(query.trip_id, 10);
                const list = db.settlements.filter(s => s.trip_id === tripId).map(s => {
                    const sender = db.members.find(m => m.id === s.sender_member_id);
                    const receiver = db.members.find(m => m.id === s.receiver_member_id);
                    return {
                        ...s,
                        sender_name: sender ? sender.name : 'Unknown',
                        receiver_name: receiver ? receiver.name : 'Unknown',
                        amount_rupees: Math.round(s.amount_paise) / 100
                    };
                });
                return sendJson(res, 200, { success: true, data: list });
            } else if (req.method === 'POST') {
                const tripId = parseInt(body.trip_id, 10);
                const amountPaise = body.amount_paise || Math.round((parseFloat(body.amount_rupees || 0)) * 100);
                const newSettlement = {
                    id: nextIds.settlements++,
                    trip_id: tripId,
                    sender_member_id: parseInt(body.sender_member_id, 10),
                    receiver_member_id: parseInt(body.receiver_member_id, 10),
                    amount_paise: amountPaise,
                    payment_date: body.payment_date || new Date().toISOString().substring(0, 10),
                    status: 'completed',
                    notes: body.notes || ''
                };
                db.settlements.unshift(newSettlement);
                return sendJson(res, 201, { success: true, data: newSettlement });
            } else if (req.method === 'DELETE') {
                const settleId = parseInt(query.id || body.id, 10);
                db.settlements = db.settlements.filter(s => s.id !== settleId);
                return sendJson(res, 200, { success: true, message: 'Settlement removed' });
            }
        }

        return sendJson(res, 404, { success: false, message: 'API Endpoint Not Found' });
    }

    // Static Asset Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);
    const ext = path.extname(filePath).toLowerCase();

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('File not found: ' + pathname);
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 TripSplit Local Server running at:`);
    console.log(`   http://localhost:${PORT}/`);
    console.log(`   http://localhost:${PORT}/index.html`);
    console.log(`   http://localhost:${PORT}/trip-details.html?id=1`);
    console.log(`   http://localhost:${PORT}/balances.html?trip_id=1`);
    console.log(`===================================================`);
});
