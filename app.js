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
if (req.session.user.role === 'Manager' || req.session.user.role === 'SuperAdmin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Check if user is superadmin only - gates the register-admin page (Jun Yuan)
// staff.role in the DB is ENUM('Chef','Manager','SuperAdmin').
const checkSuperAdmin = (req, res, next) => {
if (req.session.user && req.session.user.role === 'SuperAdmin') {
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
req.session.user = staffMember; // store user in session
req.flash('success', 'Login successful!');
// Route to the page that matches the account's role
if (staffMember.role === 'SuperAdmin') {
res.redirect('/');
} else if (staffMember.role === 'Manager') {
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
// Manager and SuperAdmin both land on the same admin homepage.
app.get('/admin', checkAuthenticated, checkManager, (req, res) => {
res.render('admin', { user: req.session.user });
});

// Manage Inventory: search/filter + stats, backed by the `ingredients` table - Manager/SuperAdmin only (Jun Yuan)
app.get('/manage-inventory', checkAuthenticated, checkManager, async (req, res) => {
    try {
        const search = req.query.search || '';
        const category = req.query.category || '';

        let sql = 'SELECT * FROM ingredients WHERE 1=1';
        const params = [];
        if (search) {
            sql += ' AND (ingredientName LIKE ? OR supplier LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }
        sql += ' ORDER BY ingredientName ASC';

        const [products] = await db.promise().query(sql, params);

        const [[{ totalIngredients }]] = await db.promise().query('SELECT COUNT(*) AS totalIngredients FROM ingredients');
        const [[{ lowStockCount }]] = await db.promise().query('SELECT COUNT(*) AS lowStockCount FROM ingredients WHERE quantity <= minimumStock');
        const [[{ expiringSoonCount }]] = await db.promise().query(`
            SELECT COUNT(*) AS expiringSoonCount
            FROM ingredients
            WHERE expiryDate >= CURDATE() AND expiryDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        `);
        const [mostUsedRows] = await db.promise().query(`
            SELECT i.ingredientName, SUM(u.quantityUsed) AS totalUsed
            FROM ingredient_usage u
            JOIN ingredients i ON i.ingredientId = u.ingredientId
            GROUP BY u.ingredientId, i.ingredientName
            ORDER BY totalUsed DESC
            LIMIT 1
        `);

        res.render('manageInventory', {
            user: req.session.user,
            staff: req.session.user,
            stats: {
                totalIngredients,
                lowStockCount,
                expiringSoonCount,
                mostUsedIngredient: mostUsedRows.length > 0 ? mostUsedRows[0].ingredientName : 'N/A'
            },
            search,
            category,
            ingredients: products,
            messages: req.flash('error'),
            successMessages: req.flash('success')
        });
    } catch (error) {
        console.error('Manage inventory error:', error);
        req.flash('error', 'Could not load the inventory manager. Please try again.');
        res.redirect('/admin');
    }
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
app.get('/search', requireLogin, async (req, res) => {
    try {
        const search = req.query.search || '';
        const category = req.query.category || '';
        const storage = req.query.storage || '';
        const expiry = req.query.expiry || '';
        const sort = req.query.sort || '';

        let sql = `
            SELECT *, DATEDIFF(expiryDate, CURDATE()) AS daysUntilExpiry
            FROM ingredients
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            sql += ` AND ingredientName LIKE ?`;
            params.push(`%${search}%`);
        }
        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }
        if (storage) {
            sql += ` AND storageLocation = ?`;
            params.push(storage);
        }
        if (expiry === 'expired') {
            sql += ` AND expiryDate < CURDATE()`;
        } else if (expiry === '3days') {
            sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)`;
        } else if (expiry === '7days') {
            sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
        }

        if (sort === 'expiry_desc') {
            sql += ` ORDER BY expiryDate DESC`;
        } else if (sort === 'name_asc') {
            sql += ` ORDER BY ingredientName ASC`;
        } else if (sort === 'newest') {
            sql += ` ORDER BY createdAt DESC`;
        } else {
            sql += ` ORDER BY expiryDate ASC`; // default: expiry_asc
        }

        const [items] = await db.promise().query(sql, params);
        const [categoryRows] = await db.promise().query(
            `SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL ORDER BY category`
        );
        const [storageRows] = await db.promise().query(
            `SELECT DISTINCT storageLocation FROM ingredients WHERE storageLocation IS NOT NULL ORDER BY storageLocation`
        );

        res.render('search', {
            user: req.session.user,
            items,
            categories: categoryRows.map(r => r.category),
            storageOptions: storageRows.map(r => r.storageLocation),
            search,
            selectedCategory: category,
            selectedStorage: storage,
            selectedExpiry: expiry,
            selectedSort: sort
        });
    } catch (error) {
        console.error('Search error:', error);
        req.flash('error', 'Something went wrong while searching. Please try again.');
        res.redirect('/dashboard');
    }
});

app.get('/expiring', requireLogin, async (req, res) => {
    try {
        const sql = `
            SELECT *, DATEDIFF(expiryDate, CURDATE()) AS daysUntilExpiry
            FROM ingredients
            WHERE expiryDate <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
            ORDER BY expiryDate ASC
        `;
        const [items] = await db.promise().query(sql);
        res.render('expiring', { user: req.session.user, items });
    } catch (error) {
        console.error('Expiring error:', error);
        req.flash('error', 'Something went wrong loading expiring items. Please try again.');
        res.redirect('/dashboard');
    }
});

// [GET] Display Ingredient Usage Form (Sean)
app.get('/ingredient-usage', checkAuthenticated, (req, res) => {

    const sql = `
        SELECT
            ingredientId,
            ingredientName,
            quantity,
            unit
        FROM ingredients
        ORDER BY ingredientName ASC
    `;

    req.db.query(sql, (err, ingredients) => {

        if (err) {
            console.error(err);
            req.flash('error', 'Unable to load ingredients.');
            return res.redirect('/dashboard');
        }

        res.render('ingredientUsage', {
            user: req.session.user,
            ingredients,
            messages: req.flash('success'),
            errors: req.flash('error')
        });

    });

});


// [POST] Record Ingredient Usage, Update Inventory & Create Restocking Request (Sean)
app.post('/ingredient-usage', checkAuthenticated, (req, res) => {

    const ingredientId = req.body.ingredientId;
    const quantityUsed = parseFloat(req.body.quantityUsed);
    const remarks = req.body.remarks;
    const staffId = req.session.user.staffId;

    if (!ingredientId || isNaN(quantityUsed) || quantityUsed <= 0) {
        req.flash('error', 'Please enter a valid quantity.');
        return res.redirect('/ingredient-usage');
    }

    const ingredientSQL = `
        SELECT *
        FROM ingredients
        WHERE ingredientId = ?
    `;

    req.db.query(ingredientSQL, [ingredientId], (err, ingredientResult) => {

        if (err) {
            console.error(err);
            req.flash('error', 'Database error.');
            return res.redirect('/ingredient-usage');
        }

        if (ingredientResult.length === 0) {
            req.flash('error', 'Ingredient not found.');
            return res.redirect('/ingredient-usage');
        }

        const ingredient = ingredientResult[0];

        if (quantityUsed > ingredient.quantity) {
            req.flash('error', 'Quantity used exceeds available stock.');
            return res.redirect('/ingredient-usage');
        }

        const usageSQL = `
            INSERT INTO ingredient_usage
            (ingredientId, staffId, quantityUsed, remarks)
            VALUES (?, ?, ?, ?)
        `;

        req.db.query(
            usageSQL,
            [ingredientId, staffId, quantityUsed, remarks],
            (err) => {

                if (err) {
                    console.error(err);
                    req.flash('error', 'Unable to record ingredient usage.');
                    return res.redirect('/ingredient-usage');
                }

                const newQuantity = ingredient.quantity - quantityUsed;

                const updateSQL = `
                    UPDATE ingredients
                    SET quantity = ?
                    WHERE ingredientId = ?
                `;

                req.db.query(
                    updateSQL,
                    [newQuantity, ingredientId],
                    (err) => {

                        if (err) {
                            console.error(err);
                            req.flash('error', 'Unable to update ingredient stock.');
                            return res.redirect('/ingredient-usage');
                        }

                        if (newQuantity <= ingredient.minimumStock) {

                            const checkSQL = `
                                SELECT *
                                FROM restock_requests
                                WHERE ingredientId = ?
                                AND status = 'Pending'
                            `;

                            req.db.query(
                                checkSQL,
                                [ingredientId],
                                (err, pendingResult) => {

                                    if (err) {
                                        console.error(err);
                                        req.flash('error', 'Unable to check restock requests.');
                                        return res.redirect('/ingredient-usage');
                                    }

                                    if (pendingResult.length === 0) {

                                        const requestQty = ingredient.minimumStock * 2;

                                        const requestSQL = `
                                            INSERT INTO restock_requests
                                            (
                                                ingredientId,
                                                requestedBy,
                                                requestedQuantity,
                                                status
                                            )
                                            VALUES (?, ?, ?, 'Pending')
                                        `;

                                        req.db.query(
                                            requestSQL,
                                            [ingredientId, staffId, requestQty],
                                            (err) => {

                                                if (err) {
                                                    console.error(err);
                                                    req.flash('error', 'Usage recorded but restock request could not be created.');
                                                    return res.redirect('/ingredient-usage');
                                                }

                                                req.flash(
                                                    'success',
                                                    'Ingredient usage recorded. Restocking request created automatically.'
                                                );

                                                return res.redirect('/ingredient-usage');
                                            }
                                        );

                                    } else {

                                        req.flash(
                                            'success',
                                            'Ingredient usage recorded successfully.'
                                        );

                                        return res.redirect('/ingredient-usage');
                                    }

                                }
                            );

                        } else {

                            req.flash(
                                'success',
                                'Ingredient usage recorded successfully.'
                            );

                            return res.redirect('/ingredient-usage');
                        }

                    }
                );

            }
        );

    });

});

// Starting the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
