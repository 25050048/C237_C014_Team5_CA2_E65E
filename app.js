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

// Hardcoded superadmin override (Jun Yuan)
// The staff table only has role ENUM('Chef','Manager') - there is no superadmin
// value in the DB. Add the staff email(s) that should get superadmin access here,
// e.g. SUPERADMIN_EMAILS = ['michaeltan@restaurant.com'].
const SUPERADMIN_EMAILS = [
    // 'youremail@example.com',
];

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
if (req.session.user.role === 'Manager' || req.session.user.isSuperAdmin) {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Check if user is superadmin only - gates the register-admin page (Jun Yuan)
// Superadmin is not a DB role (staff.role is only 'Chef'/'Manager') - it's the
// hardcoded email allowlist above, checked at login and stashed on the session.
const checkSuperAdmin = (req, res, next) => {
if (req.session.user && req.session.user.isSuperAdmin) {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Check if user is a chef - gates the chef dashboard away from managers/superadmin (Jun Yuan)
const checkChef = (req, res, next) => {
if (req.session.user && req.session.user.role === 'Chef') {
return next();
} else {
req.flash('error', 'The dashboard is for chef accounts. Use the admin board instead.');
res.redirect('/admin');
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
// Role is never read from the form - public registration always creates a 'Chef' account.
// NOTE: the DB table is `staff` (not `users`), and its name column is `fullName`.
app.post('/register', validateRegistration, (req, res) => {
    const { fullname, email, password } = req.body;
    const role = 'Chef';

    const sql = 'INSERT INTO staff (fullName, email, password, role) VALUES (?, ?, SHA1(?), ?)';
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
    const role = 'Manager';

    const sql = 'INSERT INTO staff (fullName, email, password, role) VALUES (?, ?, SHA1(?), ?)';
    db.query(sql, [fullname, email, password, role], (err, result) => {
        if (err) {
            console.error('Register-manager error:', err);
            const message = err.code === 'ER_DUP_ENTRY'
                ? 'That email is already registered.'
                : 'Something went wrong while creating the account. Please try again.';
            req.flash('error', message);
            req.flash('formData', req.body);
            return res.redirect('/register-manager');
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
// NOTE: the DB table is `staff` (not `users`).
app.post('/login', (req, res) => {
const { email, password } = req.body;
// Validate email and password
if (!email || !password) {
req.flash('error', 'All fields are required.');
return res.redirect('/login');
}
const sql = 'SELECT * FROM staff WHERE email = ? AND password = SHA1(?)';
db.query(sql, [email, password], (err, results) => {
if (err) {
console.error('Login error:', err);
req.flash('error', 'Something went wrong while logging in. Please try again.');
return res.redirect('/login');
}
if (results.length > 0) {
// Successful login
const staffMember = results[0];
staffMember.isSuperAdmin = SUPERADMIN_EMAILS.includes(staffMember.email);
req.session.user = staffMember; // store user in session
req.flash('success', 'Login successful!');
// Route to the dashboard that matches the account's role
if (staffMember.role === 'Manager' || staffMember.isSuperAdmin) {
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

// Inventory board: Good / Close to Expiry / Expired - admin/superadmin only (rizq)
app.get('/board', checkAuthenticated, checkManager, (req, res) => {
    req.db.query('SELECT * FROM ingredients', (err, results) => {
        if (err) {
            console.error('Board error:', err);
            req.flash('error', 'Could not load the inventory board. Please try again.');
            return res.redirect('/dashboard');
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

// Dashboard route - chef only (Tassie)
app.get('/dashboard', requireLogin, checkChef, async (req, res) => {
    try {
        const [totalResults] = await db.promise().query(`
            SELECT COUNT(*) AS totalIngredients
            FROM ingredients
        `);

        const [lowStockIngredients] = await db.promise().query(`
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

        const [expiredIngredients] = await db.promise().query(`
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

        const [expiringSoonIngredients] = await db.promise().query(`
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

// Helper functions for role-based access control (Tong Sun)
const isManager = (role) => role === 'manager';
const isChef = (role) => role === 'chef';

// Middleware to check if a user is logged in before viewing protected pages (Tong Sun)
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please log in to access the requested page.');
    res.redirect('/login');
};

// Middleware to restrict inventory management to Managers (Tong Sun)
const checkManager = (req, res, next) => {
    if (isManager(req.session.user?.role)) {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/manageInventory');
};

// Middleware to restrict viewing and updating of the inventory to Chefs (Tong Sun)
const checkChef = (req, res, next) => {
    if (isChef(req.session.user?.role)) {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/updateInventory');
};

// Route: home page for the kitchen inventory system (Tong Sun)
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, isManager: isManager(req.session.user?.role) });
});

// Route: manager inventory dashboard and ingredient list (Tong Sun)
app.get('/inventory', checkAuthenticated, checkManager, (req, res) => {
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (search) {
        sql += ' AND (productName LIKE ? OR supplier LIKE ? OR category LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (category) {
        sql += ' AND category = ?';
        params.push(category);
    }

    sql += ' ORDER BY expiryDate IS NULL, expiryDate ASC, quantity ASC';

    connection.query(sql, params, (error, results) => {
        if (error) throw error;

        const lowStockCount = results.filter((item) => item.quantity <= 10).length;
        const today = new Date();
        const expiringSoonCount = results.filter((item) => {
            if (!item.expiryDate) return false;
            const expiryDate = new Date(item.expiryDate);
            const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            return diffDays <= 7 && diffDays >= 0;
        }).length;

        const mostUsedIngredient = results
            .slice()
            .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0];

        res.render('inventory', {
            products: results,
            user: req.session.user,
            search,
            category,
            messages: req.flash('error'),
            successMessages: req.flash('success'),
            stats: {
                totalIngredients: results.length,
                lowStockCount,
                expiringSoonCount,
                mostUsedIngredient: mostUsedIngredient ? mostUsedIngredient.productName : 'No usage yet'
            }
        });
    });
});

// Route: authenticate users and route them based on their role (Tong Sun)
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            if (isManager(req.session.user.role)) {
                res.redirect('/manageInventory');
            } else {
                res.redirect('/updateInventory');
            }
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

// Route: chef view for available ingredients and usage recording ()
app.get('/updateInventory', checkAuthenticated, checkChef, (req, res) => {
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (search) {
        sql += ' AND (productName LIKE ? OR supplier LIKE ? OR category LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (category) {
        sql += ' AND category = ?';
        params.push(category);
    }

    sql += ' ORDER BY quantity ASC, expiryDate ASC';

    connection.query(sql, params, (error, results) => {
        if (error) throw error;
        res.render('updateInventory', {
            user: req.session.user,
            products: results,
            search,
            category,
            messages: req.flash('error'),
            successMessages: req.flash('success')
        });
    });
});

// Route: record ingredient usage after kitchen preparation ()
app.post('/record-usage/:id', checkAuthenticated, checkChef, (req, res) => {
    const productId = parseInt(req.params.id, 10);
    const usageAmount = parseInt(req.body.usageAmount, 10) || 1;

    connection.query('SELECT * FROM products WHERE productId = ?', [productId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const ingredient = results[0];
            const newQuantity = Math.max(0, (ingredient.quantity || 0) - usageAmount);
            const newUsageCount = (ingredient.usageCount || 0) + usageAmount;

            connection.query(
                'UPDATE products SET quantity = ?, usageCount = ? WHERE productId = ?',
                [newQuantity, newUsageCount, productId],
                (updateErr) => {
                    if (updateErr) throw updateErr;
                    req.flash('success', 'Ingredient usage was recorded successfully.');
                    res.redirect('/updateInventory');
                }
            );
        } else {
            res.status(404).send('Ingredient not found');
        }
    });
});

// Route: chefs submit restocking requests when ingredients are running low ()
app.post('/restocking-request/:id', checkAuthenticated, checkChef, (req, res) => {
    const ingredientId = parseInt(req.params.id, 10);
    const requestedQty = parseInt(req.body.requestedQty, 10) || 1;
    const notes = req.body.notes || '';

    if (!ingredientId || requestedQty <= 0) {
        req.flash('error', 'Please enter a valid restock quantity.');
        return res.redirect('/updateInventory');
    }

    connection.query('SELECT * FROM products WHERE productId = ?', [ingredientId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const ingredient = results[0];
            const sql = 'INSERT INTO restock_requests (ingredientId, ingredientName, requestedQty, requestedBy, notes, status) VALUES (?, ?, ?, ?, ?, ?)';
            connection.query(sql, [ingredientId, ingredient.productName, requestedQty, req.session.user.username, notes, 'Pending'], (insertErr) => {
                if (insertErr) throw insertErr;
                req.flash('success', 'Restocking request submitted successfully.');
                res.redirect('/updateInventory');
            });
        } else {
            res.status(404).send('Ingredient not found');
        }
    });
});

// Route: end the current session and return the user to the home page (Tong Sun)
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');

// Route: Show full details for one ingredient (Tong Sun)
app.get('/product/:id', checkAuthenticated, (req, res) => {
    const productId = req.params.id;

    connection.query('SELECT * FROM products WHERE productId = ?', [productId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('product', { product: results[0], user: req.session.user });
        } else {
            res.status(404).send('Ingredient not found');
        }
    });
});

// Route: Manager page to add a new ingredient record (Tong Sun)
app.get('/addIngredient', checkAuthenticated, checkManager, (req, res) => {
    res.render('addIngredient', { user: req.session.user, errorMessages: req.flash('error'), formData: {} });
});

// Route: save a new ingredient record into the database (Tong Sun)
app.post('/addIngredient', checkAuthenticated, checkManager, upload.single('image'), (req, res) => {
    const { name, quantity, unit, supplier, category, expiryDate, price } = req.body;
    const parsedQuantity = parseInt(quantity, 10) || 0;
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res.render('addIngredient', {
            user: req.session.user,
            errorMessages: ['Price must be a positive number.'],
            formData: { name, quantity, unit, supplier, category, expiryDate, price }
        });
    }

    let image = 'default-ingredient.png';

    if (req.file) {
        image = req.file.filename;
    }

    const sql = 'INSERT INTO products (productName, quantity, unit, supplier, category, expiryDate, price, image, usageCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)';
    connection.query(sql, [name, parsedQuantity, unit || 'kg', supplier || 'N/A', category || 'General', expiryDate || null, parsedPrice, image], (error) => {
        if (error) {
            console.error('Error adding ingredient:', error);
            return res.render('addIngredient', {
                user: req.session.user,
                errorMessages: [`Error adding ingredient: ${error.sqlMessage || 'Database error.'}`],
                formData: { name, quantity, unit, supplier, category, expiryDate, price }
            });
        }
        res.redirect('/manageInventory');
    });
});

// Route: Manager page to edit an existing ingredient record (Tong Sun)
app.get('/updateIngredient/:id', checkAuthenticated, checkManager, (req, res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';

    connection.query(sql, [productId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('updateIngredient', { product: results[0], user: req.session.user, errorMessages: req.flash('error') });
        } else {
            res.status(404).send('Ingredient not found');
        }
    });
});

// Route: save changes made to an existing ingredient record (Tong Sun)
app.post('/updateIngredient/:id', checkAuthenticated, checkManager, upload.single('image'), (req, res) => {
    const productId = req.params.id;
    const { name, quantity, unit, supplier, category, expiryDate, price } = req.body;
    const parsedQuantity = parseInt(quantity, 10) || 0;
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
        req.flash('error', 'Price must be a positive number.');
        return res.redirect(`/updateIngredient/${productId}`);
    }

    let image = req.body.currentImage || 'default-ingredient.png';

    if (req.file) {
        image = req.file.filename;
    }

    const sql = 'UPDATE products SET productName = ?, quantity = ?, unit = ?, supplier = ?, category = ?, expiryDate = ?, price = ?, image = ? WHERE productId = ?';
    connection.query(sql, [name, parsedQuantity, unit || 'kg', supplier || 'N/A', category || 'General', expiryDate || null, parsedPrice, image, productId], (error) => {
        if (error) {
            console.error('Error updating ingredient:', error);
            res.status(500).send('Error updating ingredient');
        } else {
            res.redirect('/manageInventory');
        }
    });
});

// Route: remove an ingredient record from the inventory (Tong Sun)
app.get('/deleteProduct/:id', checkAuthenticated, checkManager, (req, res) => {
    const productId = req.params.id;

    connection.query('DELETE FROM products WHERE productId = ?', [productId], (error) => {
        if (error) {
            console.error('Error deleting ingredient:', error);
            res.status(500).send('Error deleting ingredient');
        } else {
            res.redirect('/manageInventory');
        }
    });
});

// Starting the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
