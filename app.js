const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

// Database connection
const db = mysql.createConnection({
    host: 'c237-marlina-mysql.mysql.database.azure.com',
    user: 'c237_014',
    password: 'c237014@2026!',
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

//  Check if user is manager or superadmin. (Jun Yuan)
const checkManager = (req, res, next) => {
if (req.session.user.role === 'manager' || req.session.user.role === 'superadmin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Check if user is superadmin only - gates the register-admin page (Jun Yuan)
const checkSuperAdmin = (req, res, next) => {
if (req.session.user && req.session.user.role === 'superadmin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Alias so the existing /dashboard route (which references requireLogin) doesn't crash (Jun Yuan)
const requireLogin = checkAuthenticated;

// Routes for login (Jun Yuan)
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success')});
});

app.get('/register', (req, res) => {
    res.render('register', { user: req.session.user, messages: req.flash('error'), formData: req.flash('formData')[0] });
});

// ValidateRegistration (Jun Yuan)
const validateRegistration = (req, res, next) => {
const { fullname, email, password } = req.body;
if (!fullname || !email || !password ) {
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
// Role is never read from the form - public registration always creates a 'chef' account.
app.post('/register', validateRegistration, (req, res) => {
    const { fullname, email, password } = req.body;
    const role = 'chef';

    const sql = 'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, SHA1(?), ?)';
    db.query(sql, [fullname, email, password, role], (err, result) => {
        if (err) {
            console.error('Register error:', err);
            const message = err.code === 'ER_DUP_ENTRY'
                ? 'That email is already registered. Please log in instead.'
                : 'Something went wrong while registering. Please try again.';
            req.flash('error', message);
            req.flash('formData', req.body);
            return res.redirect('/register');
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Register-manager routes: only a logged-in superadmin can reach these (Jun Yuan)
// View file is still named registerAdmin.ejs, only the route/role/wording changed to manager.
app.get('/register-manager', checkAuthenticated, checkSuperAdmin, (req, res) => {
    res.render('registerAdmin', { user: req.session.user, messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register-manager', checkAuthenticated, checkSuperAdmin, validateRegistration, (req, res) => {
    const { fullname, email, password } = req.body;
    const role = 'manager';

    const sql = 'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, SHA1(?), ?)';
    db.query(sql, [fullname, email, password, role], (err, result) => {
        if (err) {
            throw err;
        }
        req.flash('success', 'Manager account created.');
        res.redirect('/admin');
    });
});

// Login route (Jun Yuan)
app.get('/login', (req, res) => {
res.render('login', {
user: req.session.user,
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
// Route to the dashboard that matches the account's role
if (results[0].role === 'manager' || results[0].role === 'superadmin') {
res.redirect('/admin');
} else {
res.redirect('/dashboard');
}
} else {
// Invalid credentials 
req.flash('error', 'Invalid email or password.');
res.redirect('/login');
}
});
});

// Admin route (Jun Yuan)
app.get('/admin', checkAuthenticated, checkManager, (req, res) => {
res.render('admin', { user: req.session.user });
});

// Inventory board: Good / Close to Expiry / Expired (rizq)
app.get('/board', checkAuthenticated, (req, res) => {
    req.db.query('SELECT * FROM ingredients', (err, results) => {
        if (err) {
            throw err;
        }

        const NEAR_EXPIRY_DAYS = 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const goodItems = [];
        const nearExpiryItems = [];
        const expiredItems = [];

        results.forEach((item) => {
            const expiry = new Date(item.expiryDate);
            expiry.setHours(0, 0, 0, 0);
            const daysUntilExpiry = Math.round((expiry - today) / (1000 * 60 * 60 * 24));
            item.daysUntilExpiry = daysUntilExpiry;

            if (daysUntilExpiry < 0) {
                expiredItems.push(item);
            } else if (daysUntilExpiry <= NEAR_EXPIRY_DAYS) {
                nearExpiryItems.push(item);
            } else if (item.quantity > item.minimumStock) {
                goodItems.push(item);
            }
        });

        goodItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
        nearExpiryItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
        expiredItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

        res.render('board', { user: req.session.user, goodItems, nearExpiryItems, expiredItems });
    });
});

// Logout route (Jun Yuan)
app.get('/logout', (req, res) => {
req.session.destroy();
res.redirect('/');
});

// Dashboard route (Tassie)
app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const [totalResults] = await db.query(`
            SELECT COUNT(*) AS totalIngredients
            FROM ingredients
        `);

        const [lowStockIngredients] = await db.query(`
            SELECT
                ingredientId,
                ingredientName,
                quantity,
                unit,
                minimumStock,
                expiryDate
            FROM ingredients
            WHERE quantity <= minimumStock
            ORDER BY quantity ASC
        `);

        const [expiredIngredients] = await db.query(`
            SELECT
                ingredientId,
                ingredientName,
                quantity,
                unit,
                minimumStock,
                expiryDate
            FROM ingredients
            WHERE expiryDate < CURDATE()
            ORDER BY expiryDate ASC
        `);

        const [expiringSoonIngredients] = await db.query(`
            SELECT
                ingredientId,
                ingredientName,
                quantity,
                unit,
                minimumStock,
                expiryDate
            FROM ingredients
            WHERE expiryDate >= CURDATE()
              AND expiryDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ORDER BY expiryDate ASC
        `);

        res.render('dashboard', {
            user: req.session.user || null,

            totalIngredients:
                totalResults[0].totalIngredients,

            lowStockCount:
                lowStockIngredients.length,

            expiredCount:
                expiredIngredients.length,

            expiringSoonCount:
                expiringSoonIngredients.length,

            lowStockIngredients,
            expiredIngredients,
            expiringSoonIngredients
        });

    } catch (error) {
        console.error('Dashboard error:', error);

        res.status(500).send(`
            <div style="font-family: Arial; padding: 40px;">
                <h1>Dashboard database error</h1>
                <p>${error.message}</p>
                <a href="/">Return home</a>
            </div>
        `);
    }
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
