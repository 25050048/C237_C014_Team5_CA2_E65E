const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

// Database connection
const db = mysql.createConnection({
    host: 'c237-marlina-mysql.mysql.database.azure.com',
    user: 'c237_014',
    password: 'c237014@2026',
    database: 'c237_014_team5_ca2',
    ssl: {rejectUnauthorized: false} 
});
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');

// Make db available to all routes via req.db
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Check if user is logged in (Jun Yuan)
const checkAuthenticated = (req, res, next) => {
if (req.session.user) {
return next();
} else {
req.flash('error', 'Please log in to view this resource');
res.redirect('/login');
}
};

//  Check if user is admin. (Jun Yuan)
const checkAdmin = (req, res, next) => {
if (req.session.user.role === 'admin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Routes for login (Jun Yuan)
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success')});
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

// ValidateRegistration (Jun Yuan)
const validateRegistration = (req, res, next) => {
const { username, email, password, address, contact } = req.body;
if (!username || !email || !password || !address || !contact) {
return res.send('All fields are required.');
}
if (password.length < 6) {
req.flash('error', 'Password should be at least 6 or more characters long');
req.flash('formData', req.body);
return res.redirect('/register');
}
// If all validations pass, proceed to the next middleware or route handler 
next();
};

// Register route with validateRegistration middleware integrated (Jun Yuan)
app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Login route (Jun Yuan)
app.get('/login', (req, res) => {
res.render('login', {
// Conditional rendering of flash messages for success and error messages
messages: req.flash('success'),
errors: req.flash('error')
});
});

// User login route (Jun Yuan)
app.post('/login', (req, res) => {
const { email, password } = req.body;
// Validate email and password
if (!email || !password) {
req.flash('error', 'All fields are required.');
return res.redirect('/login');
}
const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
db.query(sql, [email, password], (err, results) => {
if (err) {
throw err;
}
if (results.length > 0) {
// Successful login
req.session.user = results[0]; // store user in session
req.flash('success', 'Login successful!');
res.redirect('/dashboard');
} else {
// Invalid credentials 
req.flash('error', 'Invalid email or password.');
res.redirect('/login');
}
});
});

// Admin route (Jun Yuan)
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
res.render('admin', { user: req.session.user });
});

// Logout route (Jun Yuan)
app.get('/logout', (req, res) => {
req.session.destroy();
res.redirect('/');
});

// Search & Filter routes (Tara)
app.get('/search', (req, res) => {
    const db = req.db;
    // your search/filter query here
    res.render('search', { items: results, categories: categories, /* ...etc */ });
});

app.get('/expiring', (req, res) => {
    const db = req.db;
    // your expiring-soon query here
    res.render('expiring', { items: results });
});


// Starting the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
