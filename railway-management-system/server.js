const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Data file paths
const TRAINS_FILE = path.join(__dirname, 'data', 'trains.txt');
const TICKETS_FILE = path.join(__dirname, 'data', 'tickets.txt');

// Ensure data directory and files exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(TRAINS_FILE)) {
    // Seed with sample data
    const seedData = [
        '101|Rajdhani Express|Delhi|Mumbai|200|180',
        '102|Shatabdi Express|Delhi|Chandigarh|150|120',
        '103|Duronto Express|Mumbai|Kolkata|250|200',
        '104|Garib Rath|Delhi|Patna|300|275',
        '105|Humsafar Express|Bangalore|Chennai|180|150',
        '106|Tejas Express|Mumbai|Goa|120|95',
        '107|Vande Bharat|Delhi|Varanasi|200|160',
        '108|Jan Shatabdi|Lucknow|Delhi|250|230',
        '109|Sampark Kranti|Jaipur|Delhi|180|170',
        '110|Kerala Express|Delhi|Trivandrum|350|300'
    ].join('\n');
    fs.writeFileSync(TRAINS_FILE, seedData, 'utf-8');
}
if (!fs.existsSync(TICKETS_FILE)) {
    fs.writeFileSync(TICKETS_FILE, '', 'utf-8');
}

// ─── Helper Functions ───────────────────────────────────────────

function readTrains() {
    const content = fs.readFileSync(TRAINS_FILE, 'utf-8').trim();
    if (!content) return [];
    return content.split('\n').map(line => {
        const [trainNo, name, source, destination, totalSeats, availableSeats] = line.split('|');
        return {
            trainNo: parseInt(trainNo),
            name,
            source,
            destination,
            totalSeats: parseInt(totalSeats),
            availableSeats: parseInt(availableSeats)
        };
    });
}

function writeTrains(trains) {
    const content = trains.map(t =>
        `${t.trainNo}|${t.name}|${t.source}|${t.destination}|${t.totalSeats}|${t.availableSeats}`
    ).join('\n');
    fs.writeFileSync(TRAINS_FILE, content, 'utf-8');
}

function readTickets() {
    const content = fs.readFileSync(TICKETS_FILE, 'utf-8').trim();
    if (!content) return [];
    return content.split('\n').map(line => {
        const [pnr, passengerName, age, gender, trainNo, trainName, source, destination, status] = line.split('|');
        return { pnr, passengerName, age: parseInt(age), gender, trainNo: parseInt(trainNo), trainName, source, destination, status };
    });
}

function writeTickets(tickets) {
    const content = tickets.map(t =>
        `${t.pnr}|${t.passengerName}|${t.age}|${t.gender}|${t.trainNo}|${t.trainName}|${t.source}|${t.destination}|${t.status}`
    ).join('\n');
    fs.writeFileSync(TICKETS_FILE, content, 'utf-8');
}

function generatePNR() {
    return 'PNR' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, '0');
}

// ─── API Routes ─────────────────────────────────────────────────

// Get all trains
app.get('/api/trains', (req, res) => {
    const trains = readTrains();
    res.json({ success: true, data: trains });
});

// Search trains by source and destination
app.get('/api/trains/search', (req, res) => {
    const { source, destination } = req.query;
    if (!source || !destination) {
        return res.status(400).json({ success: false, message: 'Source and destination are required' });
    }
    const trains = readTrains();
    const results = trains.filter(t =>
        t.source.toLowerCase() === source.toLowerCase() &&
        t.destination.toLowerCase() === destination.toLowerCase()
    );
    res.json({ success: true, data: results, count: results.length });
});

// Book ticket
app.post('/api/tickets/book', (req, res) => {
    const { passengerName, age, gender, trainNo } = req.body;
    if (!passengerName || !age || !gender || !trainNo) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const trains = readTrains();
    const trainIndex = trains.findIndex(t => t.trainNo === parseInt(trainNo));
    if (trainIndex === -1) {
        return res.status(404).json({ success: false, message: 'Train not found' });
    }
    if (trains[trainIndex].availableSeats <= 0) {
        return res.status(400).json({ success: false, message: 'No seats available on this train' });
    }

    // Decrease available seats
    trains[trainIndex].availableSeats -= 1;
    writeTrains(trains);

    // Create ticket
    const pnr = generatePNR();
    const ticket = {
        pnr,
        passengerName,
        age: parseInt(age),
        gender,
        trainNo: parseInt(trainNo),
        trainName: trains[trainIndex].name,
        source: trains[trainIndex].source,
        destination: trains[trainIndex].destination,
        status: 'Confirmed'
    };
    const tickets = readTickets();
    tickets.push(ticket);
    writeTickets(tickets);

    res.json({ success: true, message: 'Ticket booked successfully!', data: ticket });
});

// Cancel ticket
app.post('/api/tickets/cancel', (req, res) => {
    const { pnr } = req.body;
    if (!pnr) {
        return res.status(400).json({ success: false, message: 'PNR number is required' });
    }
    const tickets = readTickets();
    const ticketIndex = tickets.findIndex(t => t.pnr === pnr && t.status === 'Confirmed');
    if (ticketIndex === -1) {
        return res.status(404).json({ success: false, message: 'No confirmed ticket found with this PNR' });
    }

    // Restore seat
    const trains = readTrains();
    const trainIndex = trains.findIndex(t => t.trainNo === tickets[ticketIndex].trainNo);
    if (trainIndex !== -1) {
        trains[trainIndex].availableSeats += 1;
        writeTrains(trains);
    }

    // Mark as cancelled
    tickets[ticketIndex].status = 'Cancelled';
    writeTickets(tickets);

    res.json({ success: true, message: 'Ticket cancelled successfully!', data: tickets[ticketIndex] });
});

// Get ticket by PNR
app.get('/api/tickets/:pnr', (req, res) => {
    const tickets = readTickets();
    const ticket = tickets.find(t => t.pnr === req.params.pnr);
    if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, data: ticket });
});

// ─── Admin Routes ───────────────────────────────────────────────

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Add train
app.post('/api/admin/trains', (req, res) => {
    const { trainNo, name, source, destination, totalSeats } = req.body;
    if (!trainNo || !name || !source || !destination || !totalSeats) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const trains = readTrains();
    if (trains.find(t => t.trainNo === parseInt(trainNo))) {
        return res.status(400).json({ success: false, message: 'Train number already exists' });
    }
    trains.push({
        trainNo: parseInt(trainNo),
        name,
        source,
        destination,
        totalSeats: parseInt(totalSeats),
        availableSeats: parseInt(totalSeats)
    });
    writeTrains(trains);
    res.json({ success: true, message: 'Train added successfully!' });
});

// Update train seats
app.put('/api/admin/trains/:trainNo', (req, res) => {
    const { availableSeats, totalSeats } = req.body;
    const trains = readTrains();
    const index = trains.findIndex(t => t.trainNo === parseInt(req.params.trainNo));
    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Train not found' });
    }
    if (totalSeats !== undefined) trains[index].totalSeats = parseInt(totalSeats);
    if (availableSeats !== undefined) trains[index].availableSeats = parseInt(availableSeats);
    writeTrains(trains);
    res.json({ success: true, message: 'Train updated successfully!' });
});

// Delete train
app.delete('/api/admin/trains/:trainNo', (req, res) => {
    let trains = readTrains();
    const initialLen = trains.length;
    trains = trains.filter(t => t.trainNo !== parseInt(req.params.trainNo));
    if (trains.length === initialLen) {
        return res.status(404).json({ success: false, message: 'Train not found' });
    }
    writeTrains(trains);
    res.json({ success: true, message: 'Train deleted successfully!' });
});

// ─── Serve Pages ────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/book', (req, res) => res.sendFile(path.join(__dirname, 'public', 'book.html')));
app.get('/cancel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cancel.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// Start server
app.listen(PORT, () => {
    console.log(`🚂 Railway Management System running at http://localhost:${PORT}`);
});
